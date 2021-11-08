class DAO {

  init() {
  }

  _getNow(){
    return Math.floor(block.time / 1e9)
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

}

module.exports = DAO;