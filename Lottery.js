const TOKEN_REWARD = 'zuna';
const REWARDS_ARR = ['500', '300', '200'];

class Lottery {
  init() {
  }

  _getToday() {
    return Math.floor(block.time / 1e9 / 3600 / 24);
  }

  _getNow(){
    return Math.floor(block.time / 1e9)
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

  _put(k, v, p, stringify) {
    if(stringify === false){
      storage.put(k, v, p);
    }else{
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

  _globalGet(c, k, d) {
    const val = storage.globalGet(c, k);
    if (val === null || val === "") {
      return d;
    }
    return JSON.parse(val);
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

  _setDrawDate() {
    this._put('dd', this._getToday(), tx.publisher)
  }

  _getDrawDate() {
    return this._get('dd', '');
  }

  _addDrawLog(winners) {
    let drawLogs = this._getDrawLog();
    drawLogs.push({
        drawDate: this._getToday(),
        winners: winners
    })

    drawLogs = drawLogs.slice(0, 20)
    this._put('drawLogs', drawLogs)
  }

  _getDrawLog() {
    return this._get('drawLogs', [])
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active") && !this.isLocked();
  }

  setDAO(contractID){
    this._requireOwner()
    if(contractID.length < 51 || contractID.indexOf("Contract") != 0){
      throw "Invalid contract ID."
    }
    this._put('dao', contractID, tx.publisher)
  }

  _getDAO(){
    return this._get('dao',"", true);
  }

  drawWinners() {
    let seed = block.time / 1000;
    function _random(mod=100) {
      seed ^= seed << 13; 
      seed ^= seed >> 17;
      seed ^= seed << 5;
      var res = (seed <0) ? ~seed+1 : seed;
      return res % mod;
    }

    const dao = this._getDAO();
    if (dao == '') {
      throw "DAO Contract not set."
    }
    let stakedUser = this._globalGet(dao, 'stakedUser', []); 
    let winners = [];

    if (this._getDrawDate() != this._getToday()) {
      for (let i = 0; i < 3; i++) {
        let stakeIdx = stakedUser.length
        if ( stakeIdx > 0) {
          let idx = _random(stakeIdx)
          winners.push(stakedUser[idx])

          blockchain.callWithAuth("token.iost", "transfer",
            [TOKEN_REWARD,
              blockchain.contractName(),
              stakedUser[idx],
              REWARDS_ARR[i],
              "Lottery winner."]
          );

          stakedUser.splice(idx, 1)        
        }
      }

      if (winners.length > 0) {
        this._addDrawLog(winners)
      }
    } else {
      throw "Winners are already drawn for today."
    }

    if (winners.length != 3) {
      throw "Too few users in the  staked user list."
    }
    this._setDrawDate();
    return winners;
  }

  reset() {
    this._requireOwner();
    this._put('drawLogs', [])
    this._put('dd', '')
  }
}

module.exports = Lottery;
