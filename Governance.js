const YOKOZUNA_TOKEN_SYMBOL = 'aa60';
const LOCK_DAY_SEPARATOR = '$';
const EXPIRY_DAYS = 3;
const MINIMUM_BASE_RATE = 0.5;
const APPROVAL_RATING = 0.67;
const PROPOSAL_FEE_FUND = '500';
const PROPOSAL_FEE_BURNED = '500';

const YOKOZUNA_VAULTS = [
    YOKOZUNA_TOKEN_SYMBOL + LOCK_DAY_SEPARATOR + '3',
    YOKOZUNA_TOKEN_SYMBOL + LOCK_DAY_SEPARATOR + '30',
    YOKOZUNA_TOKEN_SYMBOL + LOCK_DAY_SEPARATOR + '90',
]

const UNIVERSAL_PRECISION = 12;


class Governance {
  init() {
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

  _globalMapGet(c, k, f, d) {
    const val = storage.globalMapGet(c, k, f);
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

  _generateProposalID(){
    const lastID = this._get('lastPID', 0)
    const newPID = lastID + 1;

    this._put('lastPID', newPID);
    return newPID;
  }

  _requireProposalOwner(proposalId){
    const proposal = this._mapGet('proposal', proposalId);
    if (proposal[2] !== tx.publisher){
        throw 'Permission denied';
    }

    return proposal;
  }

  _checkSubject(subject){
    if (subject.length > 128) {
        throw 'Subject too long, 128 chars only allowed'
    }
  }

  _checkDescription(description){
    if (description.length > 512) {
        throw 'Subject too long, 128 chars only allowed'
    }
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active") && !this.isLocked();
  }

  setStake(contractID){
    this._requireOwner()

    // set swap contractID to be used for liquidity pair staking
    if(contractID.length < 51 || contractID.indexOf("Contract") != 0){
      throw "Invalid contract ID."
    }

    this._put('stake', contractID, tx.publisher)
  }

  _getStake(){
    return this._get('stake',"", true);
  }

  _processProposalFee(){
    blockchain.callWithAuth("token.iost", "transfer",
      [YOKOZUNA_TOKEN_SYMBOL,
        tx.publisher,
        blockchain.contractName(),
        PROPOSAL_FEE_FUND,
        '50% Proposal fee for fund.']
    );

    blockchain.callWithAuth("token.iost", "transfer",
      [YOKOZUNA_TOKEN_SYMBOL,
        tx.publisher,
        'deadaddr',
        PROPOSAL_FEE_BURNED,
        '50% Proposal fee burned.']
    );
  }

  _getApprovalBaseline(){
    let totalVotes = 0;

    for (let i=0; i < YOKOZUNA_VAULTS.length; i++){
        let staked = +this._globalMapGet(this._getStake(), 'vaultVotes', YOKOZUNA_VAULTS[i], 0);
        totalVotes += staked;
    }

    return totalVotes * MINIMUM_BASE_RATE;

  }

  addProposal(subject, description) {
    const proposalId = this._generateProposalID();

    this._checkSubject(subject);
    this._checkDescription(description);

    this._processProposalFee();

    this._mapPut("proposal", proposalId.toString(), [subject, description, tx.publisher], tx.publisher);

    const now = this._getNow();
    const days = 3600 * 24 * EXPIRY_DAYS

    this._mapPut("proposalStat", proposalId.toString(), {
      approval: 0,
      disapproval: 0,
      expiration: now + days,
      status: 'voting',
      approvalBase: this._getApprovalBaseline()
    }, tx.publisher);

    this._mapPut("proposalVoters", proposalId.toString(), [], tx.publisher);
    return proposalId.toString();
  }

  changeProposalDescription(proposalId, description) {
    const proposal = this._requireProposalOwner(proposalId);
    this._checkDescription(description);
    proposal[1] = description;

    this._mapPut("proposal", proposalId, proposal, tx.publisher);
  }

  setProposalAsImplemented(proposalId) {
    this._requireOwner()
    const stat = this._getProposalStat(proposalId);
    const now = this._getNow();

    if (now < stat.expiration) {
      throw 'Cannot close an active proposal.';
    }

    if (stat.status !== 'approved'){
        throw 'Cannot update proposal status to implemented if it is not approved.'
    }
    this._changeProposalStatus(proposalId, 'implemented');
  }

  closeProposal(proposalId) {
    const now = this._getNow();
    const stat = this._getProposalStat(proposalId);
    if (now < stat.expiration) {
      throw 'Cannot close an active proposal.';
    }

    const voteCasted = stat.approval + stat.disapproval;
    if (voteCasted > stat.approvalBase) {
      // we get the 50% votes check if approval rating is 67%
      const approvalRating = stat.approval / voteCasted;
      if (approvalRating >= APPROVAL_RATING){
        this._changeProposalStatus(proposalId, 'approved');
      } else {
        this._changeProposalStatus(proposalId, 'rejected');
      }
    } else {
      this._changeProposalStatus(proposalId, 'rejected');
    }
  }

  _changeProposalStatus(proposalId, status) {
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

  _setUserAction(proposalId, who, action, amount) {
    const key = proposalId + ":" + who;
    const now = this._getNow();
    const stat = this._getProposalStat(proposalId);
    const totalVotes = 0;

    if (action * 1 > 0) {
      stat.approval += amount;
    } else {
      stat.disapproval += amount;
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

  _actionOnProposal(proposalId, value, amount) {
    if (this._hasUserAction(proposalId, tx.publisher)) {
      throw "Vote exists.";
    }

    const now = this._getNow();
    const stat = this._getProposalStat(proposalId);
    if (now > stat.expiration) {
      throw "Proposal expired.";
    }

    this._addOneVoter(proposalId, tx.publisher);
    this._setUserAction(proposalId, tx.publisher, value, amount);
  }

  resetProposal(proposalId){
    const proposal = this._requireProposalOwner(proposalId);

    const key = proposalId + ":" + tx.publisher;
    const now = this._getNow();
    const stat = this._getProposalStat(proposalId);

    if (now > stat.expiration) {
      throw "Proposal expired.";
    }

    const keys = storage.mapKeys("proposalAction")
    for (let i=0; i < keys.length; i++){
      this._mapDel("proposalAction", key);    
    }

    stat.approval = 0
    stat.disapproval = 0
    this._setProposalStat(proposalId, stat);
  }

  _getZunaToken(){
    const amount = JSON.parse(blockchain.call(
      this._getStake(), "getUserTokenAmount", [tx.publisher, JSON.stringify(YOKOZUNA_VAULTS)])[0]);

    if (amount <= 0) {
       throw "Only user with staked ZUNA token can participate."
    }

    return amount
  }

  approveProposal(proposalId) {
    this._actionOnProposal(proposalId, "1", this._getZunaToken());
  }

  disapproveProposal(proposalId) {
    this._actionOnProposal(proposalId, "-1", this._getZunaToken());
  }

}

module.exports = Governance;
