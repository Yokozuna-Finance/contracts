const DAILY_DISTRIBUTION = 10000;
const ROUND_DOWN = 1;
const TOKEN_REWARD = 'iost';

class DAO {

  init() {
    let theDate = this._getNow() + 200;
    this.setStartDate(theDate)
    this.setPool()

  }

  _getNow(){
    return Math.floor(block.time / 1e9)
  }

  _requireAuth(user) {
    if (!blockchain.requireAuth(user, "active")) {
      throw new Error("Invalid account");
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

  _getReward(fromTime, toTime) {
    return new BigNumber(DAILY_DISTRIBUTION).times(toTime - fromTime).div(3600 * 24);
  }

  _setPoolObj(pool) {
    this._put('pool', pool)
  }

  _setUserInfo(who, info) {
    this._mapPut("userInfo", who, info, tx.publisher);
  }

  _updatePool(pool) {
    const now = this._getNow();
    let reward = this._getReward(pool.lastRewardTime, now)
    pool.accPerShare = new BigNumber(pool.accPerShare).plus(reward.div(pool.total)).toFixed(pool.tokenPrecision, ROUND_DOWN)
    pool.lastRewardTime = now;
    this._setPoolObj(pool);
    return pool;
  }

  setStartDate(date){
    this._requireOwner();

    const now = this._getNow().toString();
    if(date < now){
      throw "Invalid start date."
    }
    this._put('start', date, tx.publisher, false);
  }


  setPool() {
    this._requireOwner();
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
        tokenReward: this._getTokenName(),
        apy: 0
      },
      true
    )
  }

  _getPool() {
    return this._get('pool', null);
  }

  _getUserInfo(who) {
    return this._mapGet("userInfo", who, {});
  }

  stake(tokenId) {
    this._requireAuth(tx.publisher);
    const nftInfo = this._getTokenDetails(tokenId);

    if (nftInfo.owner !== tx.publisher) {
        throw "Permission denied.";
    }
    // add to user tokenId list
    this._addToUserTokenList(tokenId);

    const userInfo = this._getUserInfo(tx.publisher);

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
      userInfo[token].rewardPending = userAmount.times(pool.accPerShare).minus(
        userInfo.rewardDebt).plus(userInfo.rewardPending).toFixed(TOKEN_PRECISION, ROUND_DOWN);
    }

    blockchain.callWithAuth(
      this._getNFT(),
      'transfer', 
      [tokenId, tx.publisher, blockchain.contractName(), 1, 'NFT deposit']
    )

    userAmount = userAmount.plus(nftInfo.pushPower);
    userInfo.amount = userAmount.toFixed(pool.tokenPrecision, ROUND_DOWN);
    userInfo.rewardDebt = userAmount.times(pool.accPerShare).toFixed(pool.tokenPrecision, ROUND_UP);

    this._setUserInfo(tx.publisher, userInfo);
    pool.total = new BigNumber(pool.total).plus(nftInfo.pushPower).toFixed(pool.tokenPrecision, ROUND_DOWN);
    this._setPoolObj(pool);
    blockchain.receipt(JSON.stringify(["deposit", token, amountStr]));
    // compute for the total push power
    // update total stake value 

  }

  unstake(tokenId) {
    const stakedNFT = this._get('staked.' + tx.publisher, [])
    const nftInfo = this._getTokenDetails(tokenId);
    
    this._removeToTokenList(tokenId);

    const pool = this._getPool();
    const userInfo = this._getUserInfo(tx.publisher);

    this._updatePool(pool);

    const userAmount = new BigNumber(userInfo.amount);
    const amountStr = new BigNumber(nftInfo.pushPower).toFixed(pool.tokenPrecision, ROUND_DOWN);
    const pending = userAmount.times(pool.accPerShare).plus(
        userInfo.rewardPending).minus(userInfo.rewardDebt);
    const pendingStr = pending.toFixed(TOKEN_PRECISION, ROUND_DOWN);
    
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
    userInfo.rewardDebt = userRemainingAmount.times(pool.accPerShare).toFixed(TOKEN_PRECISION, ROUND_UP);
    this._setUserInfo(tx.publisher, userInfo);

    pool.total = new BigNumber(pool.total).minus(realAmountStr).toFixed(pool.tokenPrecision, ROUND_DOWN);
    this._setPoolObj(pool);

    blockchain.receipt(JSON.stringify(["withdraw", tokenId, pendingStr, realAmountStr]));
    return realAmountStr;
  }

  claim() {
    const userInfo = this._getUserInfo(tx.publisher);
    let pool = this._getPool()
    this._updatePool(pool);

    const userAmount = new BigNumber(userInfo.amount);
    const pending = userAmount.times(pool.accPerShare).plus(
        userInfo.rewardPending).minus(userInfo.rewardDebt);
    const pendingStr = pending.toFixed(pool.tokenPrecision, ROUND_DOWN);

    blockchain.callWithAuth("token.iost", "transfer",
        [TOKEN_REWARD,
         blockchain.contractName(),
         tx.publisher,
         pendingStr,
         "Claiming token rewards"]);

    userInfo.rewardPending = "0";
    userInfo.rewardDebt = userAmount.times(pool.accPerShare).toFixed(pool.tokenPrecision, ROUND_UP);

    blockchain.receipt(JSON.stringify(["claim", pendingStr]));
    this._setUserInfo(tx.publisher, userInfo);
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active") && !this.isLocked();
  }

}

module.exports = DAO;