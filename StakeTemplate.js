const YOKOZUNA_TOKEN_SYMBOL = '<fix me>';
const TOKEN_PRECISION = 8;
const ROUND_DOWN = 1;
const IOST_TOKEN = 'iost';
const IOST_DECIMAL = 8;

const PAD_PRECISION = 6;
const UNIVERSAL_PRECISION = 12;
const MAP_PRODUCER_COEF = "pc";
const PAIR_LOCK_DAYS = 0;
const STAKE_TEAMFEE = 0.1;
const LOCK_DAY_SEPARATOR = '$';

const TIME_LOCK_DURATION = 12 * 3600; // 12 hours


class Stake {

  init() {
    this._createToken();
    this._setDailyTokenPercentage("0.00061116535770447915");
    this._setVaultPercentagePoint("0.05")
  }

  isLocked() {
    const now = this._getNow();
    const status = +this._get("timeLockStatus", 0);
    const until = +this._get("timeLockUntil", 0);
    return status == 1 || now < until;
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active") && !this.isLocked();
  }

  _setDailyTokenPercentage(value){
    this._put("dailyDistributionPercentage", value);
  }

  _setVaultPercentagePoint(value){
    // % of votes is equivalent to  additional 1point allocation
    this._put("vaultPercentagePoint", value);
  }

  setPercentage(value){
    this._requireOwner();
    this._setDailyTokenPercentage(value)
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


  _requireOwner() {
    if(!blockchain.requireAuth(blockchain.contractOwner(), 'active')){
      throw 'Require auth error:not contractOwner';
    }
  }

  _compound(r, n=365, t=1, c=1) {
    return (1 + (r * c) / n) ** (n * t) - 1;
  }

  _checkPrecision(symbol) {
    return +this._globalMapGet("token.iost", "TI" + symbol, "decimal") || 0;
  }

  _getNow(){
    return Math.floor(block.time / 1e9)
  }


  _getTokenList(){
    return this._get('tokenList', "[]", true);
  }


  _getTokenName(){
    return this._get('token', '', false);
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


  _getTokenArray() {
    return this._get("tokenArray", [], true);
  }




  _getMultiplier(fromTime, toTime) {
    const supplyTotal = new BigNumber(blockchain.call("token.iost", "totalSupply", [this._getTokenName()]));
    const supply = new BigNumber(blockchain.call("token.iost", "supply", [this._getTokenName()]));
    const dailyDistributionPercentage = this._get('dailyDistributionPercentage', false);
    const dailyDistribution = supplyTotal.minus(supply).times(dailyDistributionPercentage).div(365);
    return new BigNumber(dailyDistribution).times(toTime - fromTime).div(3600 * 24);
  }

  _getAPY(poolPercentage){
    const supplyTotal = new BigNumber(blockchain.call("token.iost", "totalSupply", [this._getTokenName()]));
    const supply = new BigNumber(blockchain.call("token.iost", "supply", [this._getTokenName()]));
    const dailyDistributionPercentage = this._get('dailyDistributionPercentage', false);
    const yearlyDistribution = supplyTotal.minus(supply).times(dailyDistributionPercentage);

    console.log("yearlyDistribution", dailyDistributionPercentage, yearlyDistribution)
    var yearlyRewards = yearlyDistribution.times(poolPercentage);
    var simpleApy = yearlyRewards.div(supply)

    console.log("simpleApy", simpleApy)

    return this._compound(simpleApy, 2190, 1, 0.96) * 100;
  }


  _setPoolObj(key, token, pool) {
    if(["pair", "pool"].indexOf(key) < 0){
      throw "Invalid key."
    }
    this._mapPut(key, token, pool, tx.publisher);
  }


  _createToken() {
    //this._requireOwner()

    const config = {
      "decimal": 6,
      "canTransfer": true,
      "fullName": "Yokozuna Finance Token"
    };

    blockchain.callWithAuth("token.iost", "create",
        [YOKOZUNA_TOKEN_SYMBOL, blockchain.contractName(), 100000000, config]);

    this._setTokenName(YOKOZUNA_TOKEN_SYMBOL);
  }


  _setTokenName(token){
    this._put("token", token.toString(), tx.publisher);
  }


  _addToken(token) {
    const tokenArray = this._getTokenArray();

    if (tokenArray.indexOf(token) < 0) {
      tokenArray.push(token);
    }

    this._put("tokenArray", tokenArray, tx.publisher);

  }

  _getTotalAlloc() {
    return +this._get("totalAlloc", 0);
  }


  _addToTokenList(token) {
    this._addToken(token)

    const tokenList = this._getTokenList();

    if (tokenList.indexOf(token) < 0) {
      tokenList.push(token);
    }

    this._put("tokenList", tokenList, tx.publisher);
  }


  _applyDeltaToTotalAlloc(delta) {
    var totalAlloc = this._getTotalAlloc();
    totalAlloc = (totalAlloc + delta).toFixed(1);

    if (totalAlloc < 0) {
      throw "Negative total alloc";
    }

    this._put("totalAlloc", totalAlloc.toString(), tx.publisher);
  }


  _mint(token, pool) {
    // mint the token based on the current multiplier and lastRewardTime
    const now = this._getNow();
    var userToken = token.split(LOCK_DAY_SEPARATOR)[0];
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


  addPool(token, alloc, minStake, willUpdate) {
    // add single tokel pool to vault for staking
    //this._requireOwner();

    const now = this._getNow()
    const farmDate = this._get('startFarming', undefined);
    const lastRewardTime = now && now > farmDate || farmDate;

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
      lastRewardTime: lastRewardTime,
      accPerShare: "0",
      min: minStake,
      apy:"0",
    }, 
    tx.publisher);
  }


  updateAllPools() {
    const tokenArray = this._getTokenArray();
    tokenArray.forEach(token => {
      this.updatePool(token);
    });
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
    
    if(farmDate !== undefined && block.time >= farmDate){
      this._mint(token, pool);
    }
  }
}

module.exports = Stake;