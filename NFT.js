const YOKOZUNA_TOKEN_SYMBOL = 'zuna';

class NFT {

  init() {
  }

  setGeneScience(contractID){
    this._requireOwner()
    if(contractID.length < 51 || contractID.indexOf("Contract") != 0){
      throw "Invalid contract ID."
    }
    this._put('gene', contractID, tx.publisher)
  }

  setFusionFee(amount) {
    this._requireOwner();
    this._put('FUSION_FEE', +amount, false);
  }

  _getFusionFee() {
    this._get('FUSION_FEE', 2)
  }

  _getGeneScience(){
    return this._get('gene',"", true);
  }

  setAuction(contractID){
    this._requireOwner()
    if(contractID.length < 51 || contractID.indexOf("Contract") != 0){
      throw "Invalid contract ID."
    }
    this._put('auction', contractID, tx.publisher)
  }

  _getAuction(){
    return this._get('auction',"", true);
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

  _getNow(){
    return Math.floor(block.time / 1e9)
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
    return "Yokozuna." + currentID.toString();
  }

  _getRequest() {
    return JSON.parse(blockchain.contextInfo());
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

  _addToTokenList(tokenId, user) {
    let tokenList = this._mapGet('userNFT', user, []);
    tokenList.push(tokenId);
    this._mapPut('userNFT', user, tokenList)
  }

  _removeToTokenList(tokenId, user) {
    let tokenList = this._mapGet('userNFT', user, []);
    let idx = tokenList.indexOf(tokenId);
    if (idx !== -1) {
      tokenList.splice(idx, 1);
    }
    this._mapPut('userNFT', user, tokenList)
  }

  _updateTokenList(tokenId, userFrom, userTo) {
    this._removeToTokenList(tokenId, userFrom);
    this._addToTokenList(tokenId, userTo);
  }

  _mintReceipt(currentID) {
    blockchain.receipt(JSON.stringify([currentID, blockchain.contractName()]))
  }

  _generate(gene, ability, owner) {
    if(gene === undefined) {
        throw 'Invalid gene';
    }

    let currentID = this._generateID();
    let power = blockchain.call(
      this._getGeneScience(), 
      "calculatePower", 
      [gene, ability]
    )[0];

    // NFT generation 
    let tokenInfo = {
        owner: owner,
        id: currentID,
        gene: gene,
        ability: ability,
        pushPower: power,
        creator: blockchain.contractName()
    }

    console.log("TokenInfo:", tokenInfo);

    this._put('zun.' + currentID, owner);
    this._put('znft.' + currentID, tokenInfo, true);

    let balance = this._get('bal.' + owner);
    this._put('bal.' + owner, balance + 1);
    this._addToTokenList(currentID, owner);
    this._mintReceipt(currentID);
    return currentID;
  }

  _updateOwner(user, tokenId) { 
    let tokenInfo = this._get('znft.' + tokenId);
    if (tokenInfo.owner != user) {
      tokenInfo.owner = user;
      this._put('znft.' + tokenId, tokenInfo, true);
    }
  }

  _transferToken(from, to, tokenId, memo) {
    let balance_from = this._get('bal.' + from);
    this._put('bal.' + from, balance_from - 1);

    let balance_to = this._get('bal.' + to);
    this._put('bal.' + to, balance_to + 1);
    this._put('zun.' + tokenId, to);
    this._delete('app.' + tokenId);
    this._updateTokenList(tokenId, from, to);
    this._updateOwner(to, tokenId);
    this._transferReceipt(tokenId, from, to, memo)
  }

  _getOrderCount() {
    // NFT_DATA_BASE + account
    const auctionContract = this._getAuction();
    const orderData = this._globalGet(auctionContract, 'ORDER_DATA.' + auctionContract, null); 
    if (orderData && orderData.orderCount) {
      return orderData.orderCount;
    }
    return 0;
  }

  _getMaxOrderCOunt() {
    const auctionContract = this._getAuction();
    return this._globalGet(auctionContract, 'MAX_ORDER_COUNT', 0);     
  }

  generateNFT(gene, ability) { 
    this._requireOwner();
    return this._generate(gene, ability, this._getAuction());
  }

  generateInitialNFT() {
    this._requireOwner();

    let currentID = this._get('zid', 1);
    if (currentID > 1) {
        throw 'This ABI method can only be called once.';
    }

    let seed = block.time / 1000;
    function _random(mod=100) {
      seed ^= seed << 13; 
      seed ^= seed >> 17;
      seed ^= seed << 5;
      var res = (seed <0) ? ~seed+1 : seed;
      return res % mod;
    }

    let memo = 'NFT initial mint.'
    for (let x = 0; x < 10; x++) {
      let genes = '';
      for (let i = 0; i < 48; i++) {
        genes += (_random(8) + 1) .toString();
      }

      let attributes = (_random(30) + 1).toString() + '-' + 
        (_random(30) + 1).toString() + '-' + 
        (_random(30) + 1).toString();
      let tokenId = this._generate(genes, attributes, blockchain.contractName());

      blockchain.callWithAuth(
        blockchain.contractName(), 
        'transfer', 
        [tokenId, blockchain.contractName(), this._getAuction(), '1', memo]
      )
    }
  }

  _transferReceipt(tokenId, from, to, memo) {
    blockchain.receipt(JSON.stringify([tokenId, from, to, memo]));
  }

  transfer(tokenId, from, to, amount, memo) {
    // amount is unusable
    let owner = this._get('zun.' + tokenId);
    this._isNotEqual(to, owner, "Token belongs to you.");

    if (blockchain.requireAuth(from, "active")) {
      this._isEqual(from, owner, "Not allowed");
      this._transferToken(from, to, tokenId, memo);
      return;
    }

    if (blockchain.requireAuth(blockchain.contractOwner(), "active")) {
      this._transferToken(from, to, tokenId, memo);
      return;
    }

    const approver = this._get('app.' + tokenId, null);
    this._isNotNull(approver, "Not allowed.");
    if (blockchain.requireAuth(approver, "active")) {
      this._transferToken(from, to, tokenId, memo);
      return;
    }
    throw "Transfer failed";
  }

  _approveToken(to, tokenId) {
    let owner = this._get('zun.' + tokenId);
    this._isNotNull(owner, "Invalid token");
    if (tx.publisher != blockchain.contractOwner()) {
      this._requireAuth(owner);
    }
    this._put('app.' + tokenId, to);
  }

  approve(to, tokenId) {
    this._approveToken(to, tokenId);
  }

  balanceOf(owner) {
    return this._get('bal.' + owner);
  }

  ownerOf(tokenId) {
    return this._get('zun.' + tokenId);
  }

  mint() {
    this._callExternalABI(this._getAuction(), "unclaimedOrders");
    if (this._getOrderCount() < this._getMaxOrderCOunt()) {
      // decide which 2 nfts to mix???
      let tokenID = this._generateRandomNFT();
      this._callExternalABI(this._getAuction(), "sale", [tokenID]);
      return tokenID;
    }
  }

  _callExternalABI(contract, func, args=[]) {
    if (this._getRequest().caller.is_account) {
      blockchain.call(contract, func, args)[0];
    }
  }

  _generateRandomNFT(){
    let seed = block.time / 1000;
    function _random(mod=100) {
      seed ^= seed << 13; 
      seed ^= seed >> 17;
      seed ^= seed << 5;
      var res = (seed <0) ? ~seed+1 : seed;
      return res % mod;
    }

    let tokenList = this._mapGet('userNFT', this._getAuction(), []);

    let random1 = _random(tokenList.length);
    let random2 = _random(tokenList.length);
    let nftID1 = tokenList[random1];
    let nftID2 = tokenList[random2];

    let nftInfo1 = this._get('znft.' + nftID1);
    let nftInfo2 = this._get('znft.' + nftID2);
    return this._mint(nftInfo1, nftInfo2, this._getAuction(), false);
  }

  _mint(nft1, nft2, owner, fuse=false) {
    // generate nft by breeding
    let mutated_gene = blockchain.call(
      this._getGeneScience(), 
      "mixGenes", 
      [nft1.gene, nft2.gene, fuse]
    )[0];

    let mutated_ability = blockchain.call(
      this._getGeneScience(),
      "mixAbilities",
      [nft1.ability, nft2.ability, fuse]
    )[0];

    let tokenId = this._generate(
      mutated_gene,
      mutated_ability,
      blockchain.contractName()
    );
    let memo = 'NFT transfer for auction';

    if (fuse === true) {
      memo = 'NFT transfer on fusion'; 
    }
    blockchain.callWithAuth(
        blockchain.contractName(), 
        'transfer', 
        [tokenId, blockchain.contractName(), owner, '1', memo]
    )
    return tokenId;
  }

  _burn(nftID) {
    // remove it
    this.transfer(nftID, tx.publisher, 'deadaddr', '1', 'burn nft token');
  }

  updateAuctionSlot() { 
    // check if we need to mint new nft;
    while (this._getOrderCount() <= this._getMaxOrderCOunt()) { 
      let tokenID = this._generateRandomNFT();
      blockchain.call(
        this._getAuction(), 
        "sale", 
        [tokenID]
      )[0];  
    }
  }

  fuse(nftID1, nftID2) {
    // merge two nft
    if (nftID1 === nftID2) {
      throw "Cannot fuse same token.";
    }

    let owner1 = this._get('zun.' + nftID1);
    let owner2 = this._get('zun.' + nftID1);

    let nftInfo1 = this._get('znft.' + nftID1);
    let nftInfo2 = this._get('znft.' + nftID2);

    if (owner1 != tx.publisher || owner2 != tx.publisher) {
      throw "Cannot fuse token that is not yours.";
    }

    // collect fee
    blockchain.callWithAuth("token.iost", "transfer",
      [YOKOZUNA_TOKEN_SYMBOL,
       tx.publisher,
       blockchain.contractName(),
       this._getFusionFee().toString(),
       "Transaction fee."]
    );

    this._mint(nftInfo1, nftInfo2, tx.publisher, true)

    // burn the merged nfts
    this._burn(nftID1);
    this._burn(nftID2);
  }

  approveAll() {
    this._requireOwner();

    const orderIDs = this._globalGet(this._getAuction(), 'ORDER_DATA.' + tx.publisher).orders;

    for (let i = 0; i < orderIDs.length; i++) {
      // get order details and check if it is already expire
      let orderData = this._globalGet(this._getAuction(), 'ORDER.' + orderIDs[i].toString());
      if (orderData.expire < block.time) {
        const approver = this._get('app.' + orderData.tokenId, null);
        if (approver != orderData.bidder) {
          this.approve(orderData.bidder, orderData.tokenId);
        }    
      }
    } 
  }

  version(){
    return '0.0.1';
  }
}

module.exports = NFT;
