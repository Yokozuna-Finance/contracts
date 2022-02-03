
class ZunaNFT {

  init() {
    this._generate('000063169218f348dc640d171b000208934b5a90189038cb3084624a50f7316c', '');
    this._generate('00005a13429085339c6521ef0300011c82438c628cc431a63298e3721f772d29', '');
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

  _delete(k) {
    storage.del(k);
  }

  _requireOwner() {
    if(!blockchain.requireAuth(blockchain.contractOwner(), 'active')){
      throw 'Require auth error:not contractOwner';
    }
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active") && !this.isLocked();
  }

  isLocked() {
    const now = this._getNow();
    const status = +this._get("timeLockStatus", 0);
    const until = +this._get("timeLockUntil", 0);
    return status == 1 || now < until;
  }

  _generateID() {
    let currentID = this._get('zid', 1);
    this._put('zid', currentID + 1);
    return currentID;
  }

  _isNotNull(val, err) {
    if (val === null) throw err;
  }

  _isEqual(val1, val2, err) {
    if (val1 !== val2) throw err;
  }

  _isNotEqual(val1, val2, err) {
    if (val1 === val2) throw err;
  }

  _requireAuth(user) {
    if (!blockchain.requireAuth(user, "active")) {
      throw new Error("Invalid account");
    }
  }

  _generate(gene, meta) {
    console.log('>>>>>>>>>>>')
    console.log('>>>>>>>>>>>1')
    if(gene === undefined) {
        throw 'Invalid gene';
    }
    console.log('>>>>>>>>>>>2')

    let owner = blockchain.contractOwner();
    let currentID = this._generateID();

    let tokenInfo = {
        owner: owner,
        id: currentID,
        gene: gene,
        meta: meta
    }
    console.log('>>>>>>>>>>>3')

    this._put('zun.' + currentID, owner);
    this._put('znft.' + currentID, tokenInfo, true);

    let balance = this._get('bal.' + owner);
    this._put('bal.' + owner, balance + 1);
    return currentID;
  }

  _transferToken(from, to, tokenId) {
    let balance_from = this._get('bal.' + from);
    this._put('bal.' + from, balance_from - 1);

    let balance_to = this._get('bal.' + to);
    this._put('bal.' + to, balance_to + 1);

    this._put('zun.' + tokenId, to);

    this._remove('app.' + tokenId);
    const message = "transfer " + tokenId + " to " + to + " from " + from;
    blockchain.receipt(message);
  }


  transfer(token, from, to, tokenId) {
    this._isEqual(token, 'znft', "Invalid token");

    let owner = this._get('zun.' + tokenId);
    this._isNotEqual(to, owner, "Not allowed.");

    if (blockchain.requireAuth(from, "active")) {
      this._isEqual(from, owner, "Not allowed");
      this._transferEx(from, to, tokenId);
      return
    }

    if (blockchain.requireAuth(blockchain.contractOwner(), "active")) {
      this._transferToken(from, to, tokenId);
      return;
    }

    const approver = this._get('app.' + tokenId);
    this._isNotNull(approver, "Not allowed.");
    if (blockchain.requireAuth(approver, "active")) {
      this._transferToken(from, to, tokenId);
      return;
    }
    throw "Transfer failed";
  }

  _approveToken(to, tokenId) {
    let owner = this._get('zun.' + tokenId);
    this._isNotNull(owner, "Invalid token");
    this._requireAuth(owner);
    this._put('app.' + tokenId, to);
  }

  approve(token, from, to, tokenId) {
    this._mustEqual(token, 'znft', "Token not exist");
    this._approveToken(to, tokenId);
  }

  balanceOf(owner) {
    return this._get('bal.' + owner);
  }

  ownerOf(tokenId) {
    return this._get('zun.' + tokenId);
  }

  version(){
    return '0.0.1'
  }
}

module.exports = ZunaNFT;