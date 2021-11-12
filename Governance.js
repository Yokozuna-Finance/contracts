class Governance {

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

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active") && !this.isLocked();
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

    this._mapPut("proposalVoters", proposalId, []);
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
    const amount = +this._getUserTokenAmount(who, JSON.stringify(this._getTokenList())) || 0;
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
    this._requireOwner();

    const key = proposalId + ":" + who;
    const now = this._getNow();
    const stat = this._getProposalStat(proposalId);

    if (now > stat.expiration) {
      throw "Proposal expired.";
    }

    this._mapDel("proposalAction", key)
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

}

module.exports = Governance;
