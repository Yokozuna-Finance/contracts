const DAILY_DISTRIBUTION = 10000;
const ROUND_DOWN = 1;
const ROUND_UP = 0;
const TOKEN_REWARD = '<fix me>';
const STAKE_LIMIT = 9;

class DAO {

  init() {
  }

  _getNow(){
    return Math.floor(block.time / 1e9)
  }

  _requireAuth(user) {
    if (!blockchain.requireAuth(user, "active")) {
      throw new Error("Invalid account");
    }
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

  _put(k, v, stringify, p ) {
    if (p === undefined) {
        p = tx.publisher;
    }
    if (stringify === false) {
      storage.put(k, v, p);
    } else {
      storage.put(k, JSON.stringify(v), p);
    }
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

  _globalGet(c, k, d) {
    const val = storage.globalGet(c, k);
    if (val === null || val === "") {
      return d;
    }
    return JSON.parse(val);
  }

  setNFT(contractID) {
    this._requireOwner()
    if(contractID.length < 51 || contractID.indexOf("Contract") != 0){
      throw "Invalid contract ID."
    }
    this._put('nft', contractID, tx.publisher)
  }


  setDailyDistibution(amount) {
    this._requireOwner();

    amount = +amount;

    if (!amount || amount <= 0) {
        throw 'Invalid amount'
    }
    this._put('dd', amount, tx.publisher)
  }

  _getDailyDistribution() {
    return this._get('dd', DAILY_DISTRIBUTION);
  }

  _getNFT() {
    return this._get('nft',"", true);
  }

  _getTokenDetails(tokenId) {
    return this._globalGet(this._getNFT(), 'znft.' + tokenId, null); 
  } 

  _addToUserTokenList(tokenId) {
    const stakedNFT = this._get('staked.' + tx.publisher, [])
    if (stakedNFT.indexOf(tokenId) > 0) {
      throw "Token already staked."
    }
    stakedNFT.push(tokenId)
    this._put('staked.' + tx.publisher, stakedNFT, true)
  }

  _removeToUserTokenList(tokenId) {
    const stakedNFT = this._get('staked.' + tx.publisher, [])
    const stakedIdx = stakedNFT.indexOf(tokenId)
    if (stakedIdx < 0) {
      throw "Invalid token id."
    }
    stakedNFT.splice(stakedIdx, 1)
    this._put('staked.' + tx.publisher, stakedNFT, true)
  }

  _getUserStakedToken() {
    return this._get('staked.' + tx.publisher, [])
  }

  _getReward(pool, fromTime, toTime) {
    const NET = this._getDailyDistribution() - pool.distributed;
    return new BigNumber(NET).times(toTime - fromTime).div(3600 * 24);
  }

  _setPoolObj(pool) {
    this._put('pool', pool)
  }

  _setUserInfo(who, info) {
    this._mapPut("userInfo", who, info, tx.publisher);
  }

  _updatePool(pool) {
    const now = this._getNow();

    const total = new BigNumber(pool.total);

    if (total.eq(0)) {
      pool.lastRewardTime = now;
      this._setPoolObj(pool);
      return pool;
    }

    if (now > pool.end) {
      let reward = this._getReward(pool, pool.lastRewardTime, pool.end)
      pool.accPerShare = new BigNumber(pool.accPerShare).plus(reward.div(pool.total)).toFixed(pool.tokenPrecision, ROUND_DOWN)
      pool.lastRewardTime = pool.end;
      // reset to zero
      pool.distributed = 0;
      pool.start = pool.end;
      pool.end = pool.start + 86400;

      let reward2 = this._getReward(pool, pool.lastRewardTime, now)
      pool.accPerShare = new BigNumber(pool.accPerShare).plus(reward2.div(pool.total)).toFixed(pool.tokenPrecision, ROUND_DOWN)
      pool.lastRewardTime = now;
      pool.distributed = reward2

    } else {
      let reward = this._getReward(pool, pool.lastRewardTime, now)
      pool.accPerShare = new BigNumber(pool.accPerShare).plus(reward.div(pool.total)).toFixed(pool.tokenPrecision, ROUND_DOWN)
      pool.lastRewardTime = now;
      pool.distributed = new BigNumber(pool.distributed).plus(reward).toFixed(pool.tokenPrecision, ROUND_DOWN);
    }
    
    this._setPoolObj(pool);
    return pool;
  }

  setStartDate(date){
    // this._requireOwner();
    // used for testing
    const now = this._getNow().toString();
    if(date < now){
      throw "Invalid start date."
    }
    this._put('start', date, false);
  }


  setPool() {
    // this._requireOwner();
    // used for testing
    const now = this._getNow();
    const startDate = this._get('start', undefined);
    const lastRewardTime = now > startDate ? now : startDate;

    this._put(
      'pool', 
      {
        total: "0",
        tokenPrecision: 8,
        lastRewardTime: lastRewardTime,
        accPerShare: "0",
        start: startDate,
        end: startDate + 86400, // 24hrs
        distributed:0,
      },
      true
    )
  }

  _getPool() {
    return this._get('pool', null);
  }

  _getUserInfo(who) {
    return this._mapGet("userInfo", who, null);
  }

  updateUserInfo() {
    // used for testing
    const userInfo = {
        amount: "0",
        rewardPending: "0",
        rewardDebt: "0"
      }

    this._setUserInfo('testnft', userInfo);
  }

  stake(tokenId) {
    this._requireAuth(tx.publisher);
    const nftInfo = this._getTokenDetails(tokenId);

    if (nftInfo.owner !== tx.publisher) {
        throw "Permission denied.";
    }

    if (this._getUserStakedToken() >= STAKE_LIMIT) {
        throw "Max staked NFT reached."
    }
    // add to user tokenId list
    this._addToUserTokenList(tokenId);

    let userInfo = this._getUserInfo(tx.publisher);
    if (!userInfo) {
      userInfo = {
        amount: "0",
        rewardPending: "0",
        rewardDebt: "0"
      }
    }

    var userAmount = new BigNumber(userInfo.amount);

    let pool = this._getPool();
    pool = this._updatePool(pool);

    if (userAmount.gt(0)) {
      userInfo.rewardPending = userAmount.times(pool.accPerShare).minus(
        userInfo.rewardDebt).plus(userInfo.rewardPending).toFixed(pool.tokenPrecision, ROUND_DOWN);
    }

    blockchain.callWithAuth(
      this._getNFT(),
      'transfer', 
      [tokenId, tx.publisher, blockchain.contractName(), "1", 'NFT deposit']
    )

    userAmount = userAmount.plus(nftInfo.pushPower);
    userInfo.amount = userAmount.toFixed(pool.tokenPrecision, ROUND_DOWN);
    userInfo.rewardDebt = userAmount.times(pool.accPerShare).toFixed(pool.tokenPrecision, ROUND_UP);

    this._setUserInfo(tx.publisher, userInfo);
    pool.total = new BigNumber(pool.total).plus(nftInfo.pushPower).toFixed(pool.tokenPrecision, ROUND_DOWN);
    this._setPoolObj(pool);
    blockchain.receipt(JSON.stringify(["deposit", tokenId, nftInfo.pushPower]));
  }

  unstake(tokenId) {
    const stakedNFT = this._get('staked.' + tx.publisher, [])
    const nftInfo = this._getTokenDetails(tokenId);

    if (stakedNFT.indexOf(tokenId) < 0 ) {
      throw "Invalid token id."
    }
    
    this._removeToUserTokenList(tokenId);

    let pool = this._getPool();
    let userInfo = this._getUserInfo(tx.publisher);

    pool = this._updatePool(pool);

    const userAmount = new BigNumber(userInfo.amount);
    const amountStr = new BigNumber(nftInfo.pushPower).toFixed(pool.tokenPrecision, ROUND_DOWN);
    const pending = userAmount.times(pool.accPerShare).plus(
        userInfo.rewardPending).minus(userInfo.rewardDebt);
    const pendingStr = pending.toFixed(pool.tokenPrecision, ROUND_DOWN);
    
    if (new BigNumber(pendingStr).gt(0)) {
      blockchain.callWithAuth("token.iost", "transfer",
        [TOKEN_REWARD,
          blockchain.contractName(),
          tx.publisher,
          pendingStr.toString(),
          "Claimed pending rewards"]);
      userInfo.rewardPending = "0";
    }

    const userRemainingAmount = new BigNumber(userInfo.amount).minus(nftInfo.pushPower);
    if (userRemainingAmount.lt(0)) {
      throw "Invalid remaining amount";
    }

    userInfo.amount = userRemainingAmount.toFixed(pool.tokenPrecision, ROUND_DOWN);
    userInfo.rewardDebt = userRemainingAmount.times(pool.accPerShare).toFixed(pool.tokenPrecision, ROUND_UP);
    this._setUserInfo(tx.publisher, userInfo);

    pool.total = new BigNumber(pool.total).minus(nftInfo.pushPower).toFixed(pool.tokenPrecision, ROUND_DOWN);
    this._setPoolObj(pool);

    // transfer NFT to user
    blockchain.callWithAuth(
      this._getNFT(),
      'transfer', 
      [tokenId, blockchain.contractName(), tx.publisher, "1", 'NFT withdraw']
    )

    blockchain.receipt(JSON.stringify(["withdraw", tokenId, pendingStr, nftInfo.pushPower]));
    return nftInfo.pushPower;
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active") && !this.isLocked();
  }

}

module.exports = DAO;