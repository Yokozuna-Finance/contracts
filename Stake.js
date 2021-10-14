const TOKEN_PRECISION = 8;
const ROUND_DOWN = 1;
const IOST_TOKEN = 'iost';
const IOST_DECIMAL = 8;

const PAD_PRECISION = 6;
const UNIVERSAL_PRECISION = 12;
const MAP_PRODUCER_COEF = "pc";
const PAIR_LOCK_DAYS = 0;
const STAKE_TEAMFEE = 0.1;

const TIME_LOCK_DURATION = 12 * 3600; // 12 hours


class Stake {

  init() {
    this._createToken();
    this.setDailyTokenPercentage("0.03");
  }

  setDailyTokenPercentage(value){
    this._requireOwner();
    this._put("dailyDistributionPercentage", value);
  }

  isLocked() {
    const now = this._getNow();
    const status = +this._get("timeLockStatus", 0);
    const until = +this._get("timeLockUntil", 0);
    return status == 1 || now < until;
  }

  setFarmDate(date){
    this._requireOwner();

    const now = this._getNow().toString();
    if(date < now){
      throw "Invalid start date."
    }
    this._put('startFarming', date, tx.publisher, false);
  }


  issueToken(toAddress, amount){
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

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active") && !this.isLocked();
  }

  _requireOwner() {
    if(!blockchain.requireAuth(blockchain.contractOwner(), 'active')){
      throw 'Require auth error:not contractOwner';
    }
  }


  setSwap(contractID){
    // set swap contractID to be used for liquidity pair staking
    if(contractID.length != 52 || contractID.indexOf("Contract") != 0){
      throw "Invalid contract ID."
    }

    this._put('swap', contractID, tx.publisher)
  }

  _getSwap(){
    var contractID = this._get('swap',"", true);

    if(contractID.length != 52 || contractID.indexOf("Contract") != 0){
      throw "Invalid contract ID."
    }
    return contractID;
  }

  addPooltoVault(token0, token1, alloc, minStake){
    // add liquidity pair to vault for staking
    this._requireOwner()
    const pair = JSON.parse(blockchain.callWithAuth(this._getSwap(), "getPair", [token0, token1])[0]);

    if(pair === null || pair === undefined){
      throw "Invalid pair"
    }

    let pairName = pair.token0 + "/" + pair.token1;
    alloc = +alloc || 0;

    if (this._hasPair(pairName)) {
      throw "Pair vault exists";
    }

    this._addPair(pairName);
    this._applyDeltaToTotalAlloc(alloc);

    this._mapPut("pair", pairName, {
      total: "0",
      tokenPrecision: this._checkPrecision(this._getTokenName()),
      alloc: alloc,
      lastRewardTime: 0,
      accPerShare: "0",
      min: minStake,
      pairLP: pair.lp,
      tokenReward: this._getTokenName(),
      apy: this._getAPY(this._getPoolAllocPercentage(pairName))
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

  _mapDel(k, f) {
    storage.mapDel(k, f);
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
    return this._get('token', '', false);
  }

  _getTokenList(){
    return this._get('tokenList', "[]", true);
  }

  _getPairList(){
    return this._get('pairList', "[]", true);
  }

  _getProducerName(){
    return this._get('producer', 'metanyx', false);
  }

  _compound(r, n=365, t=1, c=1) {
    return (1 + (r * c) / n) ** (n * t) - 1;
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

    // create token list
    let data = [ token + "_3", token + "_30", token + "_90"];
    let alloc = ["3", "5", "10"]
    this._put("tokenList", data, tx.publisher);

    // add pools
    for (var i = data.length - 1; i >= 0; i--) {
      this.addPool(data[i], alloc[i], "1", "False")
    }
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
        [token, blockchain.contractName(), 100000000, config]);

    this._setTokenName(token);
  }

  _getToday() {
    return Math.floor(tx.time / 1e9 / 3600 / 24);
  }

  _getDate(timestamp) {
    return Math.floor(timestamp / 3600 / 24);
  }

  _getNow(){
    return Math.floor(tx.time / 1e9)
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

  getCanUnlock(who, token, amount, precision, today, days) {
    precision *= 1;
    today *= 1;
    days *= 1;
    return this._unlockInternal(who, token, amount, precision, today, days, false);
  }

  _getUserInfo(who) {
    return this._mapGet("userInfo", who, {});
  }

  _getUserTokenAmount(who, tokenList) {
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
    return this._get("tokenArray", "[]", true);
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

  _unvoteProducer(amount) {
    blockchain.callWithAuth("vote_producer.iost", "unvote", [
      blockchain.contractName(),
      this._getProducerName(),
      amount.toString()
    ]);
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

  _getTotalVote() {
    return this._get("totalVote", "0");
  }

  _setTotalVote(amountStr) {
    this._put("totalVote", amountStr, tx.publisher);
  }

  _addTotalVote(amountStr) {
    const currentStr = this._getTotalVote();
    this._setTotalVote(new BigNumber(currentStr).plus(amountStr).toFixed(UNIVERSAL_PRECISION));
  }

  _minusTotalVote(amountStr) {
    const currentStr = this._getTotalVote();
    this._setTotalVote(new BigNumber(currentStr).minus(amountStr).toFixed(UNIVERSAL_PRECISION));
  }

  _addToken(token) {
    const tokenArray = this._getTokenArray();

    if (tokenArray.indexOf(token) < 0) {
      tokenArray.push(token);
    }

    this._put("tokenArray",tokenArray, tx.publisher);

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

  addPool(token, alloc, minStake, willUpdate) {
    // add single tokel pool to vault for staking
    this._requireOwner();

    var symbol;
    if (this._getTokenList().indexOf(token) >= 0) {
      symbol = this._getTokenName();
    } else {
      symbol = token;
    }

    alloc = +alloc || 0;
    willUpdate = +willUpdate || 0;

    if (this._hasPool(token)) {
      throw "Pool exists";
    }

    if (willUpdate) {
      this.updateAllPools();
    }

    if (token.indexOf(IOST_TOKEN) < 0){
      this._addToTokenList(token);  
    }
    
    this._applyDeltaToTotalAlloc(alloc);

    this._mapPut("pool", token, {
      total: "0",
      tokenPrecision: this._checkPrecision(symbol),
      alloc: alloc,
      lastRewardTime: 0,
      accPerShare: "0",
      min: minStake,
      apy:"0",
    }, 
    tx.publisher);
  }

  _getAPY(poolPercentage){
    const supplyTotal = new BigNumber(blockchain.call("token.iost", "totalSupply", [this._getTokenName()]));
    const supply = new BigNumber(blockchain.call("token.iost", "supply", [this._getTokenName()]));
    const dailyDistributionPercentage = this._get('dailyDistributionPercentage', false);
    const yearlyDistribution = supplyTotal.minus(supply).times(dailyDistributionPercentage)

    var yearlyRewards = yearlyDistribution.times(poolPercentage);
    var simpleApy = yearlyRewards.div(supply)

    return this._compound(simpleApy, 2190, 1, 0.96) * 100;
  }

  _getPoolAllocPercentage(token){
    var pool = this._getPool(token)
    if(JSON.stringify(pool) == '{}'){
      pool = this._getPair(token)
    }
    const totalAlloc = this._getTotalAlloc();

    return new BigNumber(pool.alloc).div(totalAlloc)
  }

  _setPoolObj(key, token, pool) {
    if(["pair", "pool"].indexOf(key) < 0){
      throw "Invalid key."
    }
    this._mapPut(key, token, pool, tx.publisher);
  }

  _getDays(fromTime, toTime) {
    if(toTime < fromTime){
      return 0;
    }
    return new BigNumber(toTime - fromTime).div(3600 * 24);
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
        voteAmount: votes.plus(amount),
        withdrawable: "0",
      };
    }
    this._mapPut('userInfo', tx.publisher, userVotes, tx.publisher)
  }

  _removeUserVote(token){
    let userVotes = this._mapGet('userInfo', tx.publisher, {})
    if(userVotes[token]){
      userVotes[token]['voteAmount'] = 0;
      this._mapPut('userInfo', tx.publisher, userVotes, tx.publisher)
    }
  }

  _getMultiplier(fromTime, toTime) {
    const supplyTotal = new BigNumber(blockchain.call("token.iost", "totalSupply", [this._getTokenName()]));
    const supply = new BigNumber(blockchain.call("token.iost", "supply", [this._getTokenName()]));
    const dailyDistributionPercentage = this._get('dailyDistributionPercentage', false);
    const dailyDistribution = supplyTotal.minus(supply).times(dailyDistributionPercentage).div(365);
    return new BigNumber(dailyDistribution).times(toTime - fromTime).div(3600 * 24);
  }

  _mint(token, pool) {
    // mint the token based on the current multiplier and lastRewardTime
    const now = this._getNow();
    var userToken = token.split('_')[0];
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
    const totalAlloc = this._getTotalAlloc();
    const reward = new BigNumber(multiplier).times(pool.alloc).div(totalAlloc);

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
    pool.apy = this._getAPY(this._getPoolAllocPercentage(token))
    this._setPoolObj(type, token, pool);
  }

  updatePool(token) {
    const farmDate = this._get('startFarming', undefined);

    if (!this._hasPool(token) && !this._hasPair(token)) {
      throw "No pool for token";
    }
    var pool;
    if(this._hasPool(token)){
      pool = this._getPool(token);
    }else if(this._hasPair(token)){
      pool = this._getPair(token);  
    }
    
    if(farmDate !== undefined && tx.time >= farmDate){
      this._mint(token, pool);
    }
  }

  updateAllPools() {
    const tokenArray = this._getTokenArray();
    tokenArray.forEach(token => {
      this.updatePool(token);
    });
  }

  _deposit(token, amount) {
    if (!this._hasPool(token) && !this._hasPair(token)) {
      throw "No pool for token";
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
    

    if(amount < pool.min){
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
        voteAmount: "0",
        withdrawable: "0",
      }
    }

    this._updatePool(token, pool);
    var userAmount = new BigNumber(userInfo[token].amount);

    if (userAmount.gt(0)) {
      userInfo[token].rewardPending = userAmount.times(pool.accPerShare).minus(
        userInfo[token].rewardDebt).plus(userInfo[token].rewardPending).toFixed(TOKEN_PRECISION, ROUND_DOWN);
    }

    if (this._getTokenList().indexOf(token) >= 0 && token.indexOf(IOST_TOKEN) < 0) {
      blockchain.callWithAuth("token.iost", "transfer",
          [this._getTokenName(),
           tx.publisher,
           blockchain.contractName(),
           amountStr,
           "deposit"]);
      this._logMap("lockMap", tx.publisher, token, amountStr, TOKEN_PRECISION);
    } else if(this._getPairList().indexOf(token) >= 0){
      // deposit lp token
      blockchain.callWithAuth("token.iost", "transfer",
          [pool.pairLP,
           tx.publisher,
           blockchain.contractName(),
           amountStr,
           "deposit"]);
      this._logMap("lockMap", tx.publisher, token, amountStr, TOKEN_PRECISION);
    }else if(token.indexOf(IOST_TOKEN) >= 0 && type == 'pool'){
      blockchain.callWithAuth("token.iost", "transfer",
          ['iost',
           tx.publisher,
           blockchain.contractName(),
           amountStr,
           "deposit"]);
      this._logMap("lockMap", tx.publisher, token, amountStr, TOKEN_PRECISION);
    }

    userAmount = userAmount.plus(amountStr);
    userInfo[token].amount = userAmount.toFixed(pool.tokenPrecision, ROUND_DOWN);
    userInfo[token].rewardDebt = userAmount.times(pool.accPerShare).toFixed(TOKEN_PRECISION, ROUND_DOWN);
    this._setUserInfo(tx.publisher, userInfo);
    this._addUserBalanceList(tx.publisher);

    pool.total = new BigNumber(pool.total).plus(amount).toFixed(pool.tokenPrecision, ROUND_DOWN);
    this._setPoolObj(type, token, pool);
    blockchain.receipt(JSON.stringify(["deposit", token, amountStr]));
  }

  stake(token, amountStr) {
    if (this._getTokenList().indexOf(token) < 0 && token.indexOf(IOST_TOKEN) < 0 && this._getPairList().indexOf(token) < 0 || token == 'iost') {
      throw "Invalid token.";
    }

    this._deposit(token, amountStr);
    if(token.indexOf(IOST_TOKEN) >= 0 && this._getPairList().indexOf(token) < 0){
      if(token != 'iost' && token != 'iost_0' && token != 'iost_1'){
        this._voteProducer(amountStr)  
        // add user vote per vault
        this._addUserVote(token, amountStr)
      }
    }
    const userToken = this._getUserToken(tx.publisher);
    if (userToken == token) {
      this._addVote(userToken, amountStr);
    }
    this._addTotalVote(amountStr);
    this._addLog("stake", token, amountStr)
  }

  _getRealAmountStr(token, userAmountStr, days){
    var realAmount;
    var userToken = token.split('_')[0];

    if(this._getPairList().indexOf(token) >= 0){
      let pool = this._getPair(token)
      userToken = pool.pairLP;
      realAmount = this._unlock(tx.publisher, token, userAmountStr, TOKEN_PRECISION, days);
    }else if (this._getTokenList().indexOf(token) >= 0) {
      userToken = this._getTokenName();
      realAmount = this._unlock(tx.publisher, token, userAmountStr, TOKEN_PRECISION, days);
    } else if(token.indexOf(IOST_TOKEN) > -1){
      realAmount = this._unlock(tx.publisher, token, userAmountStr, TOKEN_PRECISION, days);  
    } else {
      realAmount = userAmountStr; 
    }

    if (new BigNumber(realAmount).lte(0)) {
      throw "No user balance / stake is still lock for token " + token ;
    }

    //var realAmountString = realAmount.toString();
    blockchain.callWithAuth("token.iost", "transfer",
      [userToken,
      blockchain.contractName(),
      tx.publisher,
      userAmountStr,
      "withdraw2"]); 
    return userAmountStr;
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

    this._updatePool(token, pool);
    const userAmount = new BigNumber(amount);
    const userAmountStr = userAmount.toFixed(pool.tokenPrecision, ROUND_DOWN);
    const pending = userAmount.times(pool.accPerShare).plus(
        userInfo[token].rewardPending).minus(userInfo[token].rewardDebt);
    const pendingStr = pending.toFixed(TOKEN_PRECISION, ROUND_DOWN);
    
    if (new BigNumber(pendingStr).gt(0)) {
      var tokenName;
      if(pool.pairLP !== undefined){
        tokenName = pool.tokenReward;
      }else{
        tokenName = token.split('_')[0];
      }

      blockchain.callWithAuth("token.iost", "transfer",
        [tokenName,
          blockchain.contractName(),
          tx.publisher,
          pendingStr.toString(),
          "claim pending"]);
      userInfo[token].rewardPending = "0";
    }

    var days;
    if(type == "pair"){
      days = PAIR_LOCK_DAYS;
    }else{
      days = token.split("_")[1] * 1;
    }
    var realAmountStr = this._getRealAmountStr(token, userAmountStr, days);
    const userRemainingAmount = new BigNumber(userInfo[token].amount).minus(realAmountStr);

    if (userRemainingAmount.lt(0)) {
      throw "Invalid remaining amount";
    }

    userInfo[token].amount = userRemainingAmount.toFixed(pool.tokenPrecision, ROUND_DOWN);
    userInfo[token].rewardDebt = userRemainingAmount.times(pool.accPerShare).toFixed(TOKEN_PRECISION, ROUND_DOWN);
    this._setUserInfo(tx.publisher, userInfo);

    pool.total = new BigNumber(pool.total).minus(realAmountStr).toFixed(pool.tokenPrecision, ROUND_DOWN);
    this._setPoolObj(type, token, pool);

    blockchain.receipt(JSON.stringify(["withdraw", token, pendingStr, realAmountStr]));
    return realAmountStr;
  }

  _validateWithdrawalAmount(token, amount){
    // check if amount to be withdrawn is correct
    const key = token + ':' + tx.publisher;
    const days = token.split("_")[1] * 1 * 24 * 3600;
    const today = this._getToday();
    const lockMap = this._mapGet('lockMap', tx.publisher, {});

    if (!lockMap[token]) {
      lockMap[token] = [];
    }

    var stakeTotal = new BigNumber(0);
    for (let i = 0; i <= lockMap[token].length -1; i++) {
      var unlockDate = this._getDate(lockMap[token][i][0] + days)
      if(unlockDate <= today){
        stakeTotal = stakeTotal.plus(lockMap[token][i][1]);  
      }
    }

    if(stakeTotal.lt(amount)){
      throw "Invalid amount to withdraw.";
    }
  }

  unstake(token, amount) {
    // Stake withdrawal
    if ((this._getTokenList().indexOf(token) < 0) && this._getPairList().indexOf(token) < 0 && (token.indexOf(IOST_TOKEN) < 0)) {
      throw "Token " + token + " is invalid.";
    }

    this._validateWithdrawalAmount(token, amount);

    const amountStr = this._withdraw(token, amount);
    const userToken = this._getUserToken(tx.publisher); // current vault vote

    if(token.indexOf(IOST_TOKEN) > -1 && this._getPairList().indexOf(token) < 0){
      const days = token.split("_")[1] * 1;
      if(token != 'iost' && token != 'iost_0' && token != 'iost_1'){
        this._unvoteProducer(amountStr)
        // subtract user vote per vault
        this._removeUserVote(token)
      }
    }

    // remove staking votes
    if (userToken == token) {
      this._minusVote(userToken, amountStr);
    }

    this._minusTotalVote(amountStr);
    this._addLog("unstake", token, amountStr)
  }

  _receipt() {
    blockchain.receipt(JSON.stringify(Object.values(arguments)));
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

    // distribute to users
    const userVotes = this._get('userBalanceList', []);
    const userCount = userVotes.length;
    const pools = this._getTokenArray();

    for (let i = 0; i <= userCount -1; i++) {
      for (let p = 0; p <= pools.length -1; p++){
        this.updatePool(pools[p])
        if(pools[p].indexOf(IOST_TOKEN) && (pools[p] != 'iost' && pools[p] != 'iost_0' && pools[p] != 'iost_1')){
          if(this._hasPool(pools[p])){
            let producerCoef;
            let producerCoefCache = {};
            let teamFeeIncrease = 0;
            let tradeInIncrease = 0;
            let userVote = this._getUserInfo(userVotes[i]);

            if (!userVote[pools[p]] || userVote[pools[p]] === undefined || userVote[pools[p]]['withdrawable'] > 0) continue;

            if(producerCoefCache.hasOwnProperty(this._getProducerName())){
              producerCoef = producerCoefCache[this._getProducerName()];
            }else{
              producerCoef = new Float64(this._mapGet(MAP_PRODUCER_COEF, this._getProducerName(), 0));
              producerCoefCache[this._getProducerName()] = producerCoef;
            }

            const grossRewards = producerCoef.multi(userVote[pools[p]]['voteAmount'] || 0);
            let teamFee = new Float64(grossRewards.multi(STAKE_TEAMFEE).toFixed(8));
            let netRewards = grossRewards.minus(teamFee)

            userVote[pools[p]].networkRewardPending = new Float64(userVote[pools[p]].networkRewardPending || 0).plus(netRewards).toFixed(8);
            this._mapPut('userInfo', userVotes[i], userVote, tx.publisher);
          }
        }
      }
    }
  }

  claim(token) {
    if (!this._hasPool(token) && !this._hasPair(token)) {
      throw "No pool for token.";
    }

    const userInfo = this._getUserInfo(tx.publisher);
    var pool;
    var type;
    var userToken = token.split('_')[0];

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

    this._updatePool(token, pool);

    const userAmount = new BigNumber(userInfo[token].amount);
    const pending = userAmount.times(pool.accPerShare).plus(
        userInfo[token].rewardPending).minus(userInfo[token].rewardDebt);
    const pendingStr = pending.toFixed(TOKEN_PRECISION, ROUND_DOWN);

    if (pending.gt(0) && pendingStr != '0.000000') {
      if(this._getTokenList().indexOf(token) >= 0){
        userToken = this._getTokenName();
      }else if(this._getPairList().indexOf(token) >=0){
        userToken = pool.tokenReward;
      }else if(token.indexOf(IOST_TOKEN) >= 0){
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

    userInfo[token].rewardDebt = userAmount.times(pool.accPerShare).toFixed(TOKEN_PRECISION, ROUND_DOWN);
    

    if(token.indexOf(IOST_TOKEN) >= 0 && this._hasPool(token)){
      let totalClaimable = new BigNumber(userInfo[token].networkRewardPending)
      totalClaimable = totalClaimable.toFixed(IOST_DECIMAL).toString()
      if(totalClaimable > 0){
        blockchain.callWithAuth(
          "token.iost",
          "transfer",
          [
            "iost",
            blockchain.contractName(),
            tx.publisher,
            totalClaimable,
            'Claiming network rewards'
          ]
        );
        blockchain.receipt(JSON.stringify(["claim network rewards ", 'iost', totalClaimable]));
        userInfo[token].networkRewardPending = "0"
      }
    }

    blockchain.receipt(JSON.stringify(["claim", token, pendingStr]));
    this._addLog("claim", token, pendingStr)
    this._setUserInfo(tx.publisher, userInfo);
  }

  addProposal(proposalId, description, expirationDays) {
    this._requireOwner();
    this._mapPut("proposal", proposalId, description, tx.publisher);

    const now = this._getNow();
    const days = 3600 * 24 * expirationDays

    this._mapPut("proposalStat", proposalId, {
      approval: 0,
      disapproval: 0,
      expiration: now + days,
      status: 'voting'
    }, tx.publisher);

    this._mapPut("proposalVoters", proposalId, "[]");
  }

  changeProposal(proposalId, description) {
    this._requireOwner();
    this._mapPut("proposal", proposalId, description, tx.publisher);
  }

  changeProposalStatus(proposalId, status) {
    this._requireOwner();
    const stat = this._getProposalStat(proposalId)
    stat.status = status
    this._setProposalStat(proposalId, stat)
  }

  _addOneVoter(proposalId, who) {
    const list = this._mapGet("proposalVoters", proposalId);
    list.push(who);
    this._mapPut("proposalVoters", proposalId, list, tx.publisher);
  }

  _getProposalStat(proposalId) {
    return this._mapGet("proposalStat", proposalId);
  }

  _setProposalStat(proposalId, stat) {
    this._mapPut("proposalStat", proposalId, stat, tx.publisher);
  }

  _setUserAction(proposalId, who, action) {
    const key = proposalId + ":" + who;
    const now = this._getNow();
    const stat = this._getProposalStat(proposalId);

    //update
    const amount = +this._getUserTokenAmount(who, JSON.stringify(this._getTokenList()))[0] || 0;
    if (amount > 0) {
      if (action * 1 > 0) {
        stat.approval += amount;
      } else {
        stat.disapproval += amount;
      }
    }

    stat.approval = +stat.approval.toFixed(UNIVERSAL_PRECISION);
    stat.disapproval = +stat.disapproval.toFixed(UNIVERSAL_PRECISION);
    this._setProposalStat(proposalId, stat);
    this._mapPut("proposalAction", key, action, tx.publisher);
  }

  _hasUserAction(proposalId, who) {
    const key = proposalId + ":" + who;
    return storage.mapHas("proposalAction", key);
  }

  _actionOnProposal(proposalId, value) {
    if (this._hasUserAction(proposalId, tx.publisher)) {
      throw "Vote exists.";
    }

    const now = this._getNow();
    const stat = this._getProposalStat(proposalId);
    if (now > stat.expiration) {
      throw "Proposal expired.";
    }

    this._addOneVoter(proposalId, tx.publisher);
    this._setUserAction(proposalId, tx.publisher, value);
  }

  resetProposal(proposalId, who){
    const key = proposalId + ":" + who;
    this._mapDel("proposalAction", key)
    const stat = this._getProposalStat(proposalId);
    stat.approval = 0
    stat.disapproval = 0
    this._setProposalStat(proposalId, stat);
  }

  approveProposal(proposalId) {
    this._actionOnProposal(proposalId, "1");
  }

  disapproveProposal(proposalId) {
    this._actionOnProposal(proposalId, "-1");
  }

  vote(token) {
    if (this._getTokenList().indexOf(token) < 0 && this._getPairList().indexOf(token) < 0 && token.indexOf(IOST_TOKEN) < 0) {
      throw 'Invalid token/pool.'
    }else if (token == 'iost'){
      throw 'Invalid token/pool.'
    }

    const userToken = this._getUserToken(tx.publisher);
    if (token == userToken) {
      throw "Vote exists."
    }

    if(userToken){
      this.unvote(userToken);  
    }
    
    this._setUserToken(tx.publisher, token);

    const amountStr = this._getUserTokenAmount(tx.publisher, JSON.stringify([token]));
    if (amountStr * 1 > 0) {
      this._addVote(token, amountStr);
    }
    this._addLog("vote", token, amountStr)
  }

  unvote(token) {
    if (this._getTokenList().indexOf(token) < 0 && this._getPairList().indexOf(token) < 0 && token.indexOf(IOST_TOKEN) < 0 ) {
      throw 'Invalid token/pool.'
    }else if (token == 'iost'){
      throw 'Invalid token/pool.'
    }

    const userToken = this._getUserToken(tx.publisher);
    if (token != userToken) {
      throw "Vote does not exist."
    }

    this._setUserToken(tx.publisher, "");

    const amountStr = this._getUserTokenAmount(tx.publisher, JSON.stringify([token]));
    if (amountStr * 1 > 0) {
      this._minusVote(token, amountStr);
    }
    this._addLog("unvote", token, amountStr)
  }

}

module.exports = Stake;