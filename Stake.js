const YOKOZUNA_TOKEN_SYMBOL = 'zuna';
const TOTAL_SUPPLY = 100000000;
const TOKEN_PRECISION = 6;
const ROUND_DOWN = 1;
const ROUND_UP = 0;
const IOST_TOKEN = 'iost';
const IOST_DECIMAL = 8;
const LOG_LIMIT = 500;

const PAD_PRECISION = 6;
const UNIVERSAL_PRECISION = 12;
const MAP_PRODUCER_COEF = "pc";
const PAIR_LOCK_DAYS = 0;
const LOCK_DAY_SEPARATOR = '$';
const DAILY_HPY = 365;

const TIME_LOCK_DURATION = 12 * 3600; // 12 hours
const DEPOSIT_FEE_LIMIT = 0.1;
const YOKOZUNA_VAULTS = [
    YOKOZUNA_TOKEN_SYMBOL + LOCK_DAY_SEPARATOR + '3',
    YOKOZUNA_TOKEN_SYMBOL + LOCK_DAY_SEPARATOR + '30',
    YOKOZUNA_TOKEN_SYMBOL + LOCK_DAY_SEPARATOR + '90',
]

class Stake {
  init() {
    this._createToken();
    this._setDailyTokenPercentage("0.03");
    this._setVaultPercentagePoint("0.05", "3")
  }

  _setDailyTokenPercentage(value){
    this._put("dailyDistributionPercentage", value);
  }

  _setVaultPercentagePoint(value, point){
    // % of votes is equivalent to  additional 1point allocation
    this._put("vaultPercentagePoint", value);
    this._put("vaultExtraPoint", point);
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active") && !this.isLocked();
  }

  _requireOwner() {
    if(!blockchain.requireAuth(blockchain.contractOwner(), 'active')){
      throw 'Require auth error:not contractOwner';
    }
  }

  isLocked() {
    const now = this._getNow();
    const status = +this._get("timeLockStatus", 0);
    const until = +this._get("timeLockUntil", 0);
    return status == 1 || now < until;
  }

  setPercentage(value){
    this._requireOwner();
    this.updateAllPools();
    this._setDailyTokenPercentage(value)
  }

  setVaultPercentage(percentage, point){
    this._requireOwner();
    // this.updateAllPools();
    this._setVaultPercentagePoint(percentage, point)
  }

  setFarmDate(date){
    this._requireOwner();

    const now = this._getNow().toString();
    if(date < now){
      throw "Invalid start date."
    }
    this.updateAllPools();
    this._put('startFarming', date, tx.publisher, false);
  }

  issueToken(toAddress, amount){
    this._requireOwner();

    // We can only issue token if start farming date is defined, 
    // farming is not started yet
    // initial allocation is less than 40% to the total token supply
    const farmDate = this._get('startFarming', undefined);
    const now = this._getNow();

    const allowableMaxIssued = new BigNumber(blockchain.call("token.iost", "totalSupply", [this._getTokenName()])
      ).times(0.4);
    const supply = new BigNumber(blockchain.call("token.iost", "supply", [this._getTokenName()])).plus(amount);

    if(farmDate === undefined){
      throw "Date start of farming should be defined."
    }else if(now > farmDate){
      throw "Cannot issue token when farming already started."
    }else if(supply > allowableMaxIssued){
      throw "Max allowable intial allocation reached."
    }

    blockchain.callWithAuth("token.iost", "issue", [this._getTokenName(), toAddress, amount]);
  }

  setSwap(contractID){
    this._requireOwner()

    // set swap contractID to be used for liquidity pair staking
    if(contractID.length < 51 || contractID.indexOf("Contract") != 0){
      throw "Invalid contract ID."
    }

    this._put('swap', contractID, tx.publisher)
  }

  _getSwap(){
    return this._get('swap',"", true);
  }

  setDAO(contractID){
    this._requireOwner()

    // set DAO fund contractID to be used for liquidity pair staking
    if(contractID.length < 51 || contractID.indexOf("Contract") != 0){
      throw "Invalid contract ID."
    }

    this._put('dao', contractID, tx.publisher)
  }

  _getDAO(){
    return this._get('dao',"", true);
  }

  addPooltoVault(token0, token1, alloc, depositFee, minStake){
    // add liquidity pair to vault for staking
    this._requireOwner()
    const pair = JSON.parse(blockchain.call(this._getSwap(), "getPair", [token0, token1])[0]);
    const now = this._getNow()
    const farmDate = this._get('startFarming', undefined);
    const lastRewardTime = now > farmDate ? now : farmDate;

    if(pair === null || pair === undefined){
      throw "Invalid pair"
    }

    let pairName = pair.token0 + "/" + pair.token1;
    alloc = +alloc || 0;
    depositFee = +depositFee || 0;

    this._checkLimit(depositFee, DEPOSIT_FEE_LIMIT)

    if (this._hasPair(pairName)) {
      throw "Pair vault exists";
    }

    this.updateAllPools();
    this._addPair(pairName);
    this._applyDeltaToTotalAlloc(alloc);

    this._mapPut("pair", pairName, {
      total: "0",
      tokenPrecision: this._checkPrecision(pair.lp),
      alloc: alloc,
      lastRewardTime: lastRewardTime,
      accPerShare: "0",
      min: minStake,
      pairLP: pair.lp,
      tokenReward: this._getTokenName(),
      apy: 0,
      depositFee: depositFee
    }, 
    tx.publisher);
  }

  _addLog(transaction, token, amount){
    const key = token + ":" + tx.publisher;
    var transLog = this._mapGet("stakingLog", key, [])
    const now = this._getNow(); 
    
    transLog.push({
      "transaction": transaction, 
      "value": amount,
      "timestamp": now,
      "hash": tx.hash
    })

    transLog = transLog.slice(-LOG_LIMIT);
    this._mapPut("stakingLog", key, transLog, tx.publisher)
  }

  _mapGet(k, f, d, parse) {
    const val = storage.mapGet(k, f);
    if (val === null || val === "") {
        return d;
    }
    if(parse === false){
      return val;
    }else{
      return JSON.parse(val);
    }   
  }

  _mapPut(k, f, v, p, stringify) {
    if(stringify === false){
      storage.mapPut(k, f, v, p);
    }else{
      storage.mapPut(k, f, JSON.stringify(v), p);
    }
  }

  _put(k, v, p, stringify) {
    if(stringify === false){
      storage.put(k, v, p);
    }else{
      storage.put(k, JSON.stringify(v), p);
    }
  }

  _get(k, d, parse) {
    const val = storage.get(k);
    if (val === null || val === "") {
      return d;
    }

    if(parse === false){
      return val;
    }else{
      return JSON.parse(val);
    }
    
  }

  _globalMapGet(c, k, f, d) {
    const val = storage.globalMapGet(c, k, f);
    if (val === null || val === "") {
      return d;
    }
    return JSON.parse(val);
  }

  _getTokenName(){
    return this._get('token', '', true);
  }

  _getTokenList(){
    return this._get('tokenList', [], true);
  }

  _getPairList(){
    return this._get('pairList', [], true);
  }

  _getIOSTList(){
    return this._get('iostList', [], true);
  }

  _getProducerName(){
    return this._get('producer', 'metanyx', true);
  }

  setProducerName(name){
    // set producer name for voting and network rewards claiming
    this._requireOwner();

    if (!storage.globalMapHas("vote_producer.iost", "producerTable", name)) {
      throw "Producer does not exist";
    }
    this._put("producer", name, tx.publisher)
  }

  _setTokenName(token){
    this._put("token", token.toString(), tx.publisher);
  }

  startTimeLock() {
    this._requireOwner();
    this._put("timeLockStatus", 1, tx.publisher);
  }

  stopTimeLock() {
    this._requireOwner();

    const now = this._getNow();
    this._put("timeLockUntil", (now + TIME_LOCK_DURATION).toString(), tx.publisher);
    this._put("timeLockStatus", 0, tx.publisher)
  }

  _createToken(token) {
    this._requireOwner()

    if (!blockchain.requireAuth(blockchain.contractOwner(), "active")) {
      throw "only owner can change";
    }

    const config = {
      "decimal": 6,
      "canTransfer": true,
      "fullName": "Yokozuna Finance Token"
    };

    blockchain.callWithAuth("token.iost", "create",
        [YOKOZUNA_TOKEN_SYMBOL.toString(), blockchain.contractName(), TOTAL_SUPPLY, config]);

    this._setTokenName(token);
  }

  _getToday() {
    return Math.floor(block.time / 1e9 / 3600 / 24);
  }

  _getDate(timestamp) {
    return Math.floor(timestamp / 3600 / 24);
  }

  _getNow(){
    return Math.floor(block.time / 1e9)
  }

  _logMap(key, who, token, amount, precision) {
    const map = this._mapGet(key, who, {});
    if (!map[token]) {
      map[token] = [];
    }

    const today = this._getToday();
    const last = map[token][map[token].length - 1];

    if (last && last[0] == today) {
      last[1] = new BigNumber(last[1]).plus(amount).toFixed(precision, ROUND_DOWN);
    } else {
      map[token].push([today, new BigNumber(amount).toFixed(precision, ROUND_DOWN)]);
    }

    this._mapPut(key, who, map, tx.publisher);
  }


  _voteMap(key, who, token, amount, precision) {
    const map = this._mapGet(key, who, {});
    const data = [
      this._getProducerName(), 
      new BigNumber(amount).toFixed(precision, ROUND_DOWN)
    ]

    if (!map[token]) {
      map[token] = [];
    }
    map[token].push(data);
    this._mapPut(key, who, map, tx.publisher);
  }

  _unlockInternal(who, token, amount, precision, today, days, willSave) {
    const map = this._mapGet("lockMap", who, {});
    if (!map[token]) {
      map[token] = [];
    }

    var remain = new BigNumber(amount);
    // loop through the lock mapping and update the balance
    while (map[token].length > 0 && remain.gt(0)) {
      const head = map[token][0];
      if (today < head[0] + days) {
        break;
      }

      if (remain.gte(head[1])) {
        remain = remain.minus(head[1]);
        map[token].shift();
      } else {
        head[1] = new BigNumber(head[1]).minus(remain).toFixed(precision, ROUND_DOWN);
        remain = new BigNumber(0);
        map[token][0] = head;
        break;
      }
    }

    if (willSave) {
      // update mapping values
      this._mapPut("lockMap", who, map, tx.publisher);
    }
    // The actually withdraw amount.
    return new BigNumber(amount).minus(remain).toFixed(precision, ROUND_DOWN);
  }

  _unlock(who, token, amount, precision, days) {
    const today = this._getToday();
    return this._unlockInternal(who, token, amount, precision, today, days, true);
  }

  _getUserInfo(who) {
    return this._mapGet("userInfo", who, {});
  }

  getUserTokenAmount(who, tokenList) {
    tokenList = JSON.parse(tokenList);

    var total = new BigNumber(0);
    tokenList.forEach(token => {
      if (this._getUserInfo(who)[token]) {
        total = total.plus(this._getUserInfo(who)[token].amount);
      }
    });

    return total.toFixed(6);
  }

  _setUserInfo(who, info) {
    this._mapPut("userInfo", who, info, tx.publisher);
  }

  _getTokenArray() {
    return this._get("tokenArray", [], true);
  }

  _setUserToken(who, token) {
    this._mapPut("userToken", who, token, tx.publisher, false);
  }

  _getUserToken(who) {
    return this._mapGet("userToken", who, "", false);
  }

  _voteProducer(amount) {
    blockchain.callWithAuth("vote_producer.iost", "vote", [
      blockchain.contractName(),
      this._getProducerName(),
      amount.toString()
    ]);
  }

  _unvoteProducer(token, amount) {
    // check voteMap for the votes to unvote

    const map = this._mapGet("voteMap", tx.publisher, {});
    if (!map[token]) {
      map[token] = [];
    }

    var remain = new BigNumber(amount);

    var unvote = {};
    // loop through the lock mapping and update the balance
    while (map[token].length > 0 && remain.gt(0)) {
      const head = map[token][0];

      if(!unvote[head[0]]){
        unvote[head[0]] = 0
      }

      if (remain.gte(head[1])) {
        remain = remain.minus(head[1]);
        unvote[head[0]] = new BigNumber(unvote[head[0]]).plus(head[1])
        map[token].shift();
      } else {
        head[1] = new BigNumber(head[1]).minus(remain).toFixed(IOST_DECIMAL, ROUND_DOWN);
        unvote[head[0]] = new BigNumber(unvote[head[0]]).plus(remain)
        remain = new BigNumber(0);
        map[token][0] = head;
        break;
      }
    }

    // update mapping values
    this._mapPut("voteMap", tx.publisher, map, tx.publisher);

    for (var key in unvote){
      blockchain.callWithAuth("vote_producer.iost", "unvote", [
        blockchain.contractName(),
        key,
        unvote[key].toString()
      ]);
    }
    
  }

  _getVote(token) {
    return this._mapGet("vote", token, 0);
  }

  _setVote(token, amountStr) {
    this._mapPut("vote", token, amountStr, tx.publisher);
  }

  _addVote(token, amountStr) {
    const currentStr = this._getVote(token);
    this._setVote(token, new BigNumber(currentStr).plus(amountStr).toFixed(UNIVERSAL_PRECISION));
  }

  _minusVote(token, amountStr) {
    const currentStr = this._getVote(token);
    this._setVote(token, new BigNumber(currentStr).minus(amountStr).toFixed(UNIVERSAL_PRECISION));
  }

  _getVaultAmount(vault) {
    return this._mapGet("vaultVotes", vault, 0);
  }

  _setVaultAmount(vault, amountStr){
    this._mapPut("vaultVotes", vault, amountStr, tx.publisher);
  }

  _addVaultAmount(vault, amountStr) {
    const currentStr = this._getVaultAmount(vault);
    this._setVaultAmount(vault, new BigNumber(currentStr).plus(amountStr).toFixed(UNIVERSAL_PRECISION));
  }

  _minusVaultAmount(vault, amountStr) {
    const currentStr = this._getVaultAmount(vault);
    this._setVaultAmount(vault, new BigNumber(currentStr).minus(amountStr).toFixed(UNIVERSAL_PRECISION));
  }

  _addToken(token) {
    const tokenArray = this._getTokenArray();

    if (tokenArray.indexOf(token) < 0) {
      tokenArray.push(token);
    }

    this._put("tokenArray", tokenArray, tx.publisher);

  }

  _addPair(pair){
    this._addToken(pair)

    const pairList = this._getPairList();

    if (pairList.indexOf(pair) < 0) {
      pairList.push(pair);
    }

    this._put("pairList", pairList, tx.publisher);
  }

  _addToTokenList(token) {
    this._addToken(token)

    const tokenList = this._getTokenList();

    if (tokenList.indexOf(token) < 0) {
      tokenList.push(token);
    }

    this._put("tokenList", tokenList, tx.publisher);
  }

  _addToIOSTList(token) {
    this._addToken(token)

    const tokenList = this._getIOSTList();

    if (tokenList.indexOf(token) < 0) {
      tokenList.push(token);
    }

    this._put("iostList", tokenList, tx.publisher);
  }

  _addUserBalanceList(user) {
    const userBalanceList = this._get("userBalanceList", []);

    if (userBalanceList.indexOf(user) < 0) {
      userBalanceList.push(user);
    }

    this._put("userBalanceList", userBalanceList, tx.publisher);
  }

  _getTotalAlloc() {
    return +this._get("totalAlloc", 0);
  }

  _applyDeltaToTotalAlloc(delta) {
    var totalAlloc = this._getTotalAlloc();
    totalAlloc = (totalAlloc + delta).toFixed(1);

    if (totalAlloc < 0) {
      throw "Negative total alloc";
    }

    this._put("totalAlloc", totalAlloc.toString(), tx.publisher);
  }

  _hasPool(token) {
    return storage.mapHas("pool", token);
  }

  _hasPair(token) {
    return storage.mapHas("pair", token);
  }

  _getPool(token) {
    return this._mapGet("pool", token, {});
  }

  _getPair(token) {
    return this._mapGet("pair", token, {});
  }

  _checkPrecision(symbol) {
    return +this._globalMapGet("token.iost", "TI" + symbol, "decimal") || 0;
  }

  _getVaultPercentage(){
    const tokenArray = this._getTokenArray();
    var totalVotes = 0;
    for (let i = 0; i <= YOKOZUNA_VAULTS.length -1; i++) {
      // only zuna token are included in the votes
      var staked = +this._getVaultAmount(YOKOZUNA_VAULTS[i]) || 0;
      totalVotes += staked; 
    }

    const votes = {};
    var totalPoints = 0;
    for (let i = 0; i <= tokenArray.length -1; i++){
      var tokenVotes = this._getVote(tokenArray[i])
      var percentage = tokenVotes/totalVotes || 0
      var multiplier = Math.floor((percentage / this._get("vaultPercentagePoint", 0, true))) || 0
      const extraPoint = multiplier * this._get("vaultExtraPoint", 1, true);
      totalPoints += extraPoint;
      votes[tokenArray[i]] = [percentage, extraPoint]
    }

    votes['totalVotes'] = [0, totalPoints]

    return votes
  }

  transfer(token_name, from, to, amount, memo){
    blockchain.callWithAuth("token.iost", "transfer", [token_name, from, to, amount, memo])
  }

  updateAllocation(vault, alloc, depositFee){
    this._requireOwner();

    alloc = +alloc;
    depositFee = +depositFee || 0 ;
    this._checkLimit(depositFee, DEPOSIT_FEE_LIMIT)

    var key;
    var pool;
    if(!alloc || alloc < 0){
        throw "Invalid allocation value."
    }

    this.updateAllPools()

    if(this._hasPool(vault)){
        pool = this._getPool(vault);
        key = 'pool';
    }else if(this._hasPair(vault)){
        pool = this._getPair(vault)
        key = 'pair';
    }else{
        throw "Invalid vault."
    }

    var delta = alloc - pool.alloc;
    pool.alloc = alloc;
    pool.depositFee = depositFee;

    this._applyDeltaToTotalAlloc(delta);
    this._setPoolObj(key, vault, pool)

  }

  _checkVaultFormat(token){
    let days = +token.split(LOCK_DAY_SEPARATOR)[1];
    if ((!days && days != 0) || days < 0 ){
        throw "Invalid vault format. [token]" + LOCK_DAY_SEPARATOR + "[lock days]"
    }
  }


  _checkLimit(value, limit){
    if(value >= limit){
        throw "Max limit reached."
    }
  }  

  addPool(token, alloc, minStake, depositFee, willUpdate) {
    // add single token pool to vault for staking
    this._requireOwner();
    this._checkVaultFormat(token)

    // check if token exists
    var userToken = token.split(LOCK_DAY_SEPARATOR)[0];
    const tokenSupply = new BigNumber(blockchain.call("token.iost", "totalSupply", [userToken]));

    const now = this._getNow();
    const farmDate = this._get('startFarming', undefined);
    const lastRewardTime = now > farmDate ? now : farmDate;

    alloc = +alloc || 0;
    depositFee = +depositFee || 0 ;

    this._checkLimit(depositFee, DEPOSIT_FEE_LIMIT)

    willUpdate = +willUpdate || 0;

    if (this._hasPool(token)) {
      throw "Pool exists";
    }

    if (willUpdate) {
      this.updateAllPools();
    }

    if (userToken == IOST_TOKEN){
      this._addToIOSTList(token);  
    }else{
      this._addToTokenList(token);
    }
    
    this._applyDeltaToTotalAlloc(alloc);

    this._mapPut("pool", token, {
      total: "0",
      tokenPrecision: this._checkPrecision(userToken),
      alloc: alloc,
      lastRewardTime: lastRewardTime,
      accPerShare: "0",
      min: minStake,
      apy:"0",
      depositFee: depositFee,
    }, 
    tx.publisher);
  }

  getAPY(token){
    return this._getAPY(token, this._getPoolAllocPercentage(token));
  }

  _getYearlyDistribution(dailyDist, rate){
    var baseSupply = dailyDist / rate;
    var total = 0;
    for (let i = 0; i < DAILY_HPY; i++){
        var dailyDistribution = baseSupply * rate;
        baseSupply -= dailyDistribution;
        total += dailyDistribution;
    }
    return new BigNumber(total);
  }

  _getAPY(token, poolPercentage){
    // 
    const totalStaked = this._getVaultAmount(token);
    const dailyDistributionPercentage = this._get('dailyDistributionPercentage', false);
    const dailyDistribution = this._getDailyDistribution();

    const yearlyDistribution = this._getYearlyDistribution(dailyDistribution, dailyDistributionPercentage)
    var yearlyRewards = yearlyDistribution.times(poolPercentage);
    return yearlyRewards.div(totalStaked) * 100
  }

  _getPoolAllocPercentage(token){
    var pool = this._getPool(token)
    if(JSON.stringify(pool) == '{}'){
      pool = this._getPair(token)
    }

    var extraAlloc = this._getVaultPercentage();
    var totalAlloc = this._getTotalAlloc();
    var poolAlloc = pool.alloc + extraAlloc[token][1]

    totalAlloc += extraAlloc['totalVotes'][1]

    return new BigNumber(poolAlloc).div(totalAlloc)
  }

  _setPoolObj(key, token, pool) {
    if(["pair", "pool"].indexOf(key) < 0){
      throw "Invalid key."
    }
    this._mapPut(key, token, pool, tx.publisher);
  }

  _addWithdrawLog(token, amount){
    let userWithdrawals = this._mapGet('withdrawals', tx.publisher, []);
    userWithdrawals.push([this._getNow() + 3 * 24 * 3600, amount, token])
    this._mapPut('withdrawals', tx.publisher, userWithdrawals, tx.publisher)

  }

  _addUserVote(token, amount){
    let userVotes = this._mapGet('userInfo', tx.publisher, {})

    if(userVotes[token] !== undefined ){
      let votes = new BigNumber(userVotes[token]['voteAmount'] || '0')
      userVotes[token]['voteAmount'] = votes.plus(amount);
    }else{
      let votes = new BigNumber('0');
      userVotes[token] = {
        amount: "0",
        rewardPending: "0",
        rewardDebt: "0",
        networkRewardPending: "0",
        voteAmount: votes.plus(amount)
      };
    }
    this._mapPut('userInfo', tx.publisher, userVotes, tx.publisher)
    this._voteMap('voteMap',tx.publisher, token, amount, IOST_DECIMAL)
  }

  _removeUserVote(token, amountStr){
    let userVotes = this._mapGet('userInfo', tx.publisher, {})
    if(userVotes[token]){
      userVotes[token]['voteAmount'] = new BigNumber(userVotes[token]['voteAmount']).minus(amountStr);
      this._mapPut('userInfo', tx.publisher, userVotes, tx.publisher)
    }

    // add log for once unvote releases the amount
    this._addWithdrawLog(token, amountStr);
  }

  _getDailyDistribution(){
    // get daily distrib from storage first
    // if within the same date, use it, else get the new daily distribution
    const distrib = this._get("dailyDistribution", [0,0])
    const today = this._getToday();

    if(today == distrib[0]){
        return distrib[1]
    }else{
        const supplyTotal = new BigNumber(blockchain.call("token.iost", "totalSupply", [this._getTokenName()]));
        const supply = new BigNumber(blockchain.call("token.iost", "supply", [this._getTokenName()]));
        const dailyDistributionPercentage = this._get('dailyDistributionPercentage', false);
        const dailyDistribution = supplyTotal.minus(supply).times(dailyDistributionPercentage);
        this._put("dailyDistribution", [today, dailyDistribution])
        return dailyDistribution
    }
  }

  _getMultiplier(fromTime, toTime) {
    const dailyDistribution = this._getDailyDistribution();
    return new BigNumber(dailyDistribution).times(toTime - fromTime).div(3600 * 24);
  }

  _mint(token, pool) {
    // mint the token based on the current multiplier and lastRewardTime
    const now = this._getNow();
    var type = this._hasPair(token) && "pair" || "pool";

    if (now <= pool.lastRewardTime) {
      return;
    }

    const total = new BigNumber(pool.total);

    if (total.eq(0)) {
      pool.lastRewardTime = now;
      this._setPoolObj(type, token, pool);
      return;
    }

    // 1) Process token
    const multiplier = this._getMultiplier(pool.lastRewardTime, now);
    
    var extraAlloc = this._getVaultPercentage();
    var totalAlloc = this._getTotalAlloc();
    var poolAlloc = pool.alloc + extraAlloc[token][1];
    totalAlloc += extraAlloc['totalVotes'][1]

    let reward = new BigNumber(multiplier).times(poolAlloc).div(totalAlloc);

    //check supply if we still need to mint
    const supply = new BigNumber(blockchain.call("token.iost", "supply", [this._getTokenName()]));
    if(supply.plus(reward).gt(TOTAL_SUPPLY)){
        this._put("blackholed", true)
        reward = new BigNumber(TOTAL_SUPPLY).minus(supply);
        
    }

    if (reward.gt(0)) {
      const rewardForFarmers = reward.times(0.9);
      const rewardForDev = reward.times(0.1);

      // Mint token.
      blockchain.callWithAuth("token.iost", "issue",
        [this._getTokenName(), blockchain.contractName(), rewardForFarmers.toFixed(TOKEN_PRECISION, ROUND_DOWN)]);
      blockchain.callWithAuth("token.iost", "issue",
        [this._getTokenName(), blockchain.contractOwner(), rewardForDev.toFixed(TOKEN_PRECISION, ROUND_DOWN)]);

      // PAD_PRECISION here to make sure we have enough precision per share.
      pool.accPerShare = new BigNumber(pool.accPerShare).plus(rewardForFarmers.div(total)).toFixed(TOKEN_PRECISION + PAD_PRECISION, ROUND_DOWN);
    }
    // 3) Done.
    pool.lastRewardTime = now;
    pool.apy = this._getAPY(token, this._getPoolAllocPercentage(token))
    this._setPoolObj(type, token, pool);
  }

  _updatePool(token, pool) {
    const farmDate = this._get('startFarming', undefined);
    const blackholed = this._get('blackholed', false);

    if (!this._hasPool(token) && !this._hasPair(token)) {
      throw "No pool for token.";
    }
    
    if(farmDate !== undefined && this._getNow() >= farmDate && !blackholed){
      this._mint(token, pool);
    }
  }

  updateAllPools() {
    const tokenArray = this._getTokenArray();
    tokenArray.forEach(token => {
      var pool;
      if(this._hasPool(token)){
        pool = this._getPool(token);
      }else if(this._hasPair(token)){
        pool = this._getPair(token);  
      }
      if(pool != undefined){
        this._updatePool(token, pool);  
      }
      
    });
  }

  _deposit(token, amount) {
    if (!this._hasPool(token) && !this._hasPair(token)) {
      throw "No pool for token " + token;
    }

    var pool;
    var type;

    if(this._hasPool(token)){
      pool = this._getPool(token);
      type = 'pool';
    }else if(this._hasPair(token)){
      pool = this._getPair(token);
      type = 'pair'
    }

    const depositFee = this._takeDepositFee(pool, amount)
    amount = new BigNumber(amount).minus(depositFee);

    if(pool === undefined){
      throw "Invalid token"
    }

    if(amount.lt(pool.min)){
      throw "Amount is less than the minimum stake value";
    }

    amount = new BigNumber(amount);
    const amountStr = amount.toFixed(pool.tokenPrecision, ROUND_DOWN);

    if (amount.lte(0)) {
      throw "Amount is less than zero.";
    }

    const userInfo = this._getUserInfo(tx.publisher);

    if (!userInfo[token]) {
      userInfo[token] = {
        amount: "0",
        rewardPending: "0",
        rewardDebt: "0",
        networkRewardPending: "0",
        voteAmount: "0"
      }
    }

    var userAmount = new BigNumber(userInfo[token].amount);
    const distrib = this._get("dailyDistribution", [0,0])
    const today = this._getToday();

    if(today == distrib[0]){
        this._updatePool(token, pool);
    }else{
        this.updateAllPools();
        if(type == 'pair'){
            pool = this._getPair(token);
        }else{
            pool = this._getPool(token);
        }
    }

    if (userAmount.gt(0)) {
      userInfo[token].rewardPending = userAmount.times(pool.accPerShare).minus(
        userInfo[token].rewardDebt).plus(userInfo[token].rewardPending).toFixed(TOKEN_PRECISION, ROUND_DOWN);
    }

    if (this._getTokenList().indexOf(token) >= 0) {
      var userToken = token.split(LOCK_DAY_SEPARATOR)[0];
      blockchain.callWithAuth("token.iost", "transfer",
          [userToken,
           tx.publisher,
           blockchain.contractName(),
           amountStr,
           "deposit"]);
      if(depositFee.gt(0)){
        blockchain.callWithAuth("token.iost", "transfer",
          [userToken,
           tx.publisher,
           this._getDAO(),
           depositFee,
           "deposit fee to dao contract"]);  
      }
    } else if(this._getPairList().indexOf(token) >= 0){
      // deposit lp token
      blockchain.callWithAuth("token.iost", "transfer",
          [pool.pairLP,
           tx.publisher,
           blockchain.contractName(),
           amountStr,
           "deposit"]);
      if(depositFee.gt(0)){
          blockchain.callWithAuth("token.iost", "transfer",
              [pool.pairLP,
               tx.publisher,
               this._getDAO(),
               depositFee,
               "deposit fee to dao contract"]);
      }
    }else if(this._getIOSTList().indexOf(token) >=0 && type == 'pool'){
      blockchain.callWithAuth("token.iost", "transfer",
          [IOST_TOKEN,
           tx.publisher,
           blockchain.contractName(),
           amountStr,
           "deposit"]);
      if(depositFee.gt(0)){
          blockchain.callWithAuth("token.iost", "transfer",
              [IOST_TOKEN,
               tx.publisher,
               this._getDAO(),
               depositFee,
               "deposit fee to dao contract"]);
      }
      
    }
    this._logMap("lockMap", tx.publisher, token, amountStr, pool.tokenPrecision);

    userAmount = userAmount.plus(amountStr);
    userInfo[token].amount = userAmount.toFixed(pool.tokenPrecision, ROUND_DOWN);
    userInfo[token].rewardDebt = userAmount.times(pool.accPerShare).toFixed(TOKEN_PRECISION, ROUND_UP);
    this._setUserInfo(tx.publisher, userInfo);
    this._addUserBalanceList(tx.publisher);

    pool.total = new BigNumber(pool.total).plus(amount).toFixed(pool.tokenPrecision, ROUND_DOWN);
    this._setPoolObj(type, token, pool);
    blockchain.receipt(JSON.stringify(["deposit", token, amountStr]));

    return amountStr
  }

  _takeDepositFee(vault, amountStr){
    if(vault.depositFee != undefined){
        return new BigNumber(amountStr).times(vault.depositFee);    
    }else{
        return new BigNumber(0);
    }
  }

  clearLog(vault){
    const tokenArray = this._getTokenArray();
    if(tokenArray.indexOf(vault) < 0){
        throw "Invalid vault."
    }
    const key = vault + ":" + tx.publisher;
    this._mapPut("stakingLog", key, [], tx.publisher)
  }

  stake(token, amountStr) {
    var amount = +amountStr || 0;

    if (amount <= 0){
        throw "Invalid amount.";
    }

    if (this._getTokenList().indexOf(token) < 0 && this._getIOSTList().indexOf(token) < 0 && this._getPairList().indexOf(token) < 0) {
      throw "Invalid vault.";
    }

    // _deposit takes the depositFee 
    var amountStr = this._deposit(token, amountStr);
    if(this._getIOSTList().indexOf(token) > -1){
      this._voteProducer(amountStr)  
      // add user vote per vault
      this._addUserVote(token, amountStr)
    }
    const userToken = this._getUserToken(tx.publisher);
    if (userToken && YOKOZUNA_VAULTS.indexOf(token) > -1) {
      this._addVote(userToken, amountStr);
    }
    this._checkUserWithdrawals(tx.publisher);
    this._addVaultAmount(token, amountStr);
    this._addLog("stake", token, amountStr)
  }

  _getRealAmountStr(token, userAmountStr, pool, days){
    var realAmount;
    var userToken = token.split(LOCK_DAY_SEPARATOR)[0];

    if(this._getPairList().indexOf(token) >= 0){
      userToken = pool.pairLP;
      realAmount = this._unlock(tx.publisher, token, userAmountStr, pool.tokenPrecision, days);
    }else if (this._getTokenList().indexOf(token) >= 0) {
      realAmount = this._unlock(tx.publisher, token, userAmountStr, pool.tokenPrecision, days);
    } else if(this._getIOSTList().indexOf(token) >=0){
      realAmount = this._unlock(tx.publisher, token, userAmountStr, pool.tokenPrecision, days);  
    } else {
      realAmount = userAmountStr; 
    }

    if (new BigNumber(realAmount).lte(0)) {
      throw "No user balance / stake is still lock for vault " + token ;
    }

    if(this._getIOSTList().indexOf(token) < 0){
      // non iost vauts dont have withdrawal delay
      blockchain.callWithAuth("token.iost", "transfer",
        [userToken,
         blockchain.contractName(),
         tx.publisher,
         realAmount,
         "withdraw stake token"]);
    }

    return realAmount;
  }

  _withdraw(token, amount) {
    if (!this._hasPool(token) && !this._hasPair(token)) {
      throw "No pool for token.";
    }

    var pool;
    var type;
    if(this._hasPool(token)){
      pool = this._getPool(token);
      type = 'pool';
    }else if(this._hasPair(token)){
      pool = this._getPair(token);
      type = 'pair'
    }

    if(pool === undefined){
      throw "Invalid token"
    }

    const userInfo = this._getUserInfo(tx.publisher);

    if (userInfo[token] === undefined) {
      // Empty pool
      return "0";
    }

    const distrib = this._get("dailyDistribution", [0,0])
    const today = this._getToday();

    if(today == distrib[0]){
        this._updatePool(token, pool);
    }else{
        this.updateAllPools();
        if(type == 'pair'){
            pool = this._getPair(token);
        }else{
            pool = this._getPool(token);
        }
    }

    const userAmount = new BigNumber(userInfo[token].amount);
    const amountStr = new BigNumber(amount).toFixed(pool.tokenPrecision, ROUND_DOWN);
    const pending = userAmount.times(pool.accPerShare).plus(
        userInfo[token].rewardPending).minus(userInfo[token].rewardDebt);
    const pendingStr = pending.toFixed(TOKEN_PRECISION, ROUND_DOWN);
    
    if (new BigNumber(pendingStr).gt(0)) {
      blockchain.callWithAuth("token.iost", "transfer",
        [this._getTokenName(),
          blockchain.contractName(),
          tx.publisher,
          pendingStr.toString(),
          "Claimed pending rewards"]);
      userInfo[token].rewardPending = "0";
    }

    if(this._getIOSTList().indexOf(token) >= 0 && this._hasPool(token)){
      let totalClaimable = new BigNumber(userInfo[token].networkRewardPending)
      if (totalClaimable.gt(0)){
        totalClaimable = totalClaimable.toFixed(IOST_DECIMAL).toString()
        blockchain.callWithAuth(
          "token.iost",
          "transfer",
          [
            IOST_TOKEN,
            blockchain.contractName(),
            tx.publisher,
            totalClaimable,
            'Claimed pending network rewards'
          ]
        );
        userInfo[token].networkRewardPending = "0"
      }
    }

    var days;
    if(type == "pair"){
      days = PAIR_LOCK_DAYS;
    }else{
      days = token.split(LOCK_DAY_SEPARATOR)[1] * 1;
    }
    var realAmountStr = this._getRealAmountStr(token, amountStr, pool, days);
    const userRemainingAmount = new BigNumber(userInfo[token].amount).minus(realAmountStr);

    if (userRemainingAmount.lt(0)) {
      throw "Invalid remaining amount";
    }

    userInfo[token].amount = userRemainingAmount.toFixed(pool.tokenPrecision, ROUND_DOWN);
    userInfo[token].rewardDebt = userRemainingAmount.times(pool.accPerShare).toFixed(TOKEN_PRECISION, ROUND_UP);
    this._setUserInfo(tx.publisher, userInfo);

    pool.total = new BigNumber(pool.total).minus(realAmountStr).toFixed(pool.tokenPrecision, ROUND_DOWN);
    this._setPoolObj(type, token, pool);

    blockchain.receipt(JSON.stringify(["withdraw", token, pendingStr, realAmountStr]));
    return realAmountStr;
  }

  _validateWithdrawalAmount(token, amount){
    // check if amount to be withdrawn is correct
    const days = token.split(LOCK_DAY_SEPARATOR)[1] * 1 || PAIR_LOCK_DAYS;
    const today = this._getToday();
    const lockMap = this._mapGet('lockMap', tx.publisher, {});

    if (!lockMap[token]) {
      lockMap[token] = [];
    }

    var stakeTotal = new BigNumber(0);
    for (let i = 0; i <= lockMap[token].length -1; i++) {

      var unlockDate = lockMap[token][i][0] + days;
      if(unlockDate <= today){
        stakeTotal = stakeTotal.plus(lockMap[token][i][1]);  
      }
    }

    if(stakeTotal.lt(amount)){
      throw "Invalid amount to withdraw.";
    }
  }

  unstake(token, amount) {
    // ensure amount is an integer else set it to 0
    amount = +amount || 0;

    if (amount <= 0){
        throw "Invalid amount.";
    } 

    // Stake withdrawal
    if ((this._getTokenList().indexOf(token) < 0) && this._getPairList().indexOf(token) < 0 && this._getIOSTList().indexOf(token) < 0) {
      throw "Token " + token + " is invalid.";
    }

    this._validateWithdrawalAmount(token, amount);

    const amountStr = this._withdraw(token, amount);
    const userToken = this._getUserToken(tx.publisher); // current vault vote

    if(this._getIOSTList().indexOf(token) > -1){
      this._unvoteProducer(token, amountStr)
      // subtract user vote per vault
      this._removeUserVote(token, amountStr)
    }

    // remove staking votes
    if (userToken && YOKOZUNA_VAULTS.indexOf(token) > -1) {
      this._minusVote(userToken, amountStr);
    }

    this._checkUserWithdrawals(tx.publisher);
    this._minusVaultAmount(token, amountStr);
    this._addLog("unstake", token, amountStr)
  }

  _checkUserWithdrawals(user){
    let userWithdrawals = this._mapGet('withdrawals', user, [])
    for(let uw=0; uw <= userWithdrawals.length -1; uw++){
      if(userWithdrawals[uw][0] < this._getNow()){

        // transfer amount to user
        if(userWithdrawals[uw][1] > 0){
          blockchain.callWithAuth("token.iost", "transfer",
            [IOST_TOKEN,
              blockchain.contractName(),
              user,
              userWithdrawals[uw][1].toString(),
              "withdraw staked iost token"]);
        }
        //remove from the list
        userWithdrawals.splice(uw, 1);
        uw -= 1;      
      }else{
        break;
      }
    }
    this._mapPut('withdrawals', user, userWithdrawals, tx.publisher)
  }

  processProducerBonus() {
    this._requireOwner();

    let contractVotes = blockchain.call(
      "vote_producer.iost",
      "getVote",
      [blockchain.contractName()]
    );

    if (contractVotes && Array.isArray(contractVotes) && contractVotes.length >= 1) {
      contractVotes = contractVotes[0] === "" ? [] : JSON.parse(contractVotes[0]);
    }

    for (const contractVote of contractVotes) {
      const producerName = contractVote.option;
      const producerVotes = contractVote.votes;

      const voterCoef = new Float64(
        this._globalMapGet('vote_producer.iost', "voterCoef", producerName, "0")
      );

      const voterMask = new Float64(
        this._globalMapGet('vote_producer.iost', "v_" + producerName, blockchain.contractName(), "0")
      );

      let totalRewards = voterCoef.multi(producerVotes);
      let newRewards = new Float64(totalRewards.minus(voterMask).toFixed(8));

      const newCoef = newRewards.div(producerVotes);
      this._mapPut(MAP_PRODUCER_COEF, producerName, newCoef, tx.publisher);

    }

    blockchain.callWithAuth("vote_producer.iost", "voterWithdraw", [
      blockchain.contractName()
    ]);

  }

  setProducerCoef(producerCoef) {
    this._requireOwner();
    this._mapPut(MAP_PRODUCER_COEF, 'yzblock1', producerCoef, tx.publisher);
    this._mapPut(MAP_PRODUCER_COEF, 'yzblock2', producerCoef, tx.publisher);
  }

  distributeProducerBonus(usersPerRun){
    usersPerRun = +usersPerRun || 50;
    // get the last userProcessed
    let lastUserProcessed = this._get('lup');
    let userVotes = this._get('userBalanceList', []);
    const userLength = userVotes.length;
    let lastUser = userVotes.slice(-1)[0]
    let idx = 0;

    if (lastUserProcessed){
      idx = userVotes.indexOf(lastUserProcessed) + 1;
    }
    userVotes = userVotes.slice(idx, idx + usersPerRun);
    const userCount = userVotes.length;
    const pools = this._getIOSTList();

    this.updateAllPools();
    for (let i = 0; i <= userCount -1; i++) {
      let userInfo = this._getUserInfo(userVotes[i]);
      let voteMap = this._mapGet("voteMap", userVotes[i], {});

      for (let p = 0; p <= pools.length -1; p++){
        var pool = this._getPool(pools[p]);
        let producerCoef;
        let producerCoefCache = {};
        
        if (!userInfo[pools[p]] || userInfo[pools[p]] === undefined) continue;

        // loop through user vote mapping
        for (let v = 0; v <= voteMap[pools[p]].length -1; v++){
          if(producerCoefCache.hasOwnProperty(voteMap[pools[p]][v][0])){
            producerCoef = producerCoefCache[voteMap[pools[p]][v][0]];
          }else{
            producerCoef = new Float64(this._mapGet(MAP_PRODUCER_COEF, voteMap[pools[p]][v][0], 0));
            producerCoefCache[voteMap[pools[p]][v][0]] = producerCoef;
          }

          const netRewards = producerCoef.multi(voteMap[pools[p]][v][1] || 0);
          userInfo[pools[p]].networkRewardPending = new Float64(userInfo[pools[p]].networkRewardPending || 0).plus(netRewards).toFixed(8);
        }
        this._mapPut('userInfo', userVotes[i], userInfo, tx.publisher);
      }
      lastUserProcessed = userVotes[i];
    }
    if (lastUserProcessed == lastUser){
        this._put('lup', '');
    } else {
        this._put('lup', lastUserProcessed);
    }
    blockchain.receipt(JSON.stringify(["Processed " + (idx + userCount) + '/' + userLength]))
  }

  checkUserWithdrawals(usersPerRun){
    usersPerRun = +usersPerRun || 50;
    // get the last userProcessed
    let lastUserProcessed = this._get('ludp');
    let userList = this._get('userBalanceList', []);
    const userLength = userList.length;
    let lastUser = userList.slice(-1)[0]
    let idx = 0;

    if (lastUserProcessed){
      idx = userList.indexOf(lastUserProcessed) + 1;
    }
    userList = userList.slice(idx, idx + usersPerRun);
    const userCount = userList.length;
    
    for (let i = 0; i <= userCount -1; i++) {
      this._checkUserWithdrawals(userList[i]);
      lastUserProcessed = userList[i];
    }

    if (lastUserProcessed == lastUser){
        this._put('ludp', '');
    } else {
        this._put('ludp', lastUserProcessed)
    }
    blockchain.receipt(JSON.stringify(["Processed " + (idx + userCount) + '/' + userLength]))
    
  }

  claim(token) {
    if (!this._hasPool(token) && !this._hasPair(token)) {
      throw "No pool for token.";
    }

    const userInfo = this._getUserInfo(tx.publisher);
    var pool;
    var type;
    var userToken;

    if(this._hasPair(token)){
      pool = this._getPair(token);
      type = 'pair';
    }else{
      pool = this._getPool(token);
      type = 'pool';
    }

    if (!userInfo[token]) {
      // Empty pool
      return;
    }

    const distrib = this._get("dailyDistribution", [0,0])
    const today = this._getToday();
    if(today == distrib[0]){
        this._updatePool(token, pool);
    }else{
        this.updateAllPools();
        if(type == 'pair'){
            pool = this._getPair(token);
        }else{
            pool = this._getPool(token);
        }
    }

    const userAmount = new BigNumber(userInfo[token].amount);
    const pending = userAmount.times(pool.accPerShare).plus(
        userInfo[token].rewardPending).minus(userInfo[token].rewardDebt);
    const pendingStr = pending.toFixed(TOKEN_PRECISION, ROUND_DOWN);

    if (pending.gt(0) && pendingStr != '0.000000') {
      if(this._getTokenList().indexOf(token) >= 0){
        userToken = this._getTokenName();
      }else if(this._getPairList().indexOf(token) >=0){
        userToken = pool.tokenReward;
      }else if(this._getIOSTList().indexOf(token) >= 0){
        userToken = this._getTokenName(); 
      }else{
        throw "Invalid user token."
      }

      blockchain.callWithAuth("token.iost", "transfer",
        [userToken,
         blockchain.contractName(),
         tx.publisher,
         pendingStr,
         "Claiming token rewards"]);
      userInfo[token].rewardPending = "0";
    }

    userInfo[token].rewardDebt = userAmount.times(pool.accPerShare).toFixed(TOKEN_PRECISION, ROUND_UP);
    
    if(this._getIOSTList().indexOf(token) >= 0 && this._hasPool(token)){
      let totalClaimable = new BigNumber(userInfo[token].networkRewardPending)
      if(totalClaimable.gt(0)){
        totalClaimable = totalClaimable.toFixed(IOST_DECIMAL).toString()
        blockchain.callWithAuth(
          "token.iost",
          "transfer",
          [
            IOST_TOKEN,
            blockchain.contractName(),
            tx.publisher,
            totalClaimable,
            'Claiming network rewards'
          ]
        );
        blockchain.receipt(JSON.stringify(["claim network rewards ", IOST_TOKEN, totalClaimable]));
        userInfo[token].networkRewardPending = "0"
      }
    }

    this._checkUserWithdrawals(tx.publisher);
    blockchain.receipt(JSON.stringify(["claim", token, pendingStr]));
    this._setUserInfo(tx.publisher, userInfo);
  }

  vote(token) {
    if (this._getTokenList().indexOf(token) < 0 && this._getPairList().indexOf(token) < 0 && this._getIOSTList().indexOf(token) < 0) {
      throw 'Invalid token/pool.'
    }else if (token == IOST_TOKEN){
      throw 'Invalid token/pool.'
    }

    const amountStr = this.getUserTokenAmount(tx.publisher, JSON.stringify(YOKOZUNA_VAULTS));
    if(amountStr * 1 <= 0){
        throw "No staked " + YOKOZUNA_TOKEN_SYMBOL + " token to vote."
    }

    const userToken = this._getUserToken(tx.publisher);
    if (token == userToken) {
      throw "Vote exists."
    }

    if(userToken){
      this.unvote(userToken);  
    }
    
    this._setUserToken(tx.publisher, token);
    if (amountStr * 1 > 0) {
      this.updateAllPools();
      this._addVote(token, amountStr);
      this._addLog("vote", token, amountStr)
    }
  }

  unvote(token) {
    if (this._getTokenList().indexOf(token) < 0 && this._getPairList().indexOf(token) < 0 && this._getIOSTList().indexOf(token) < 0 ) {
      throw 'Invalid token/pool.'
    }else if (token == IOST_TOKEN){
      throw 'Invalid token/pool.'
    }

    const userToken = this._getUserToken(tx.publisher);
    if (token != userToken) {
      throw "Vote does not exist."
    }

    this._setUserToken(tx.publisher, "");
    const amountStr = this.getUserTokenAmount(tx.publisher, JSON.stringify(YOKOZUNA_VAULTS));
    if (amountStr * 1 > 0) {
      this.updateAllPools();
      this._minusVote(token, amountStr);
      this._addLog("unvote", token, amountStr)
    }
  }
}

module.exports = Stake;