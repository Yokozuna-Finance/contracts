const NFT_CONTRACT_ID = 'NFT_CONTRACT';
const DAO_CONTRACT_ID = 'DAO_CONTRACT_ID';
const TOKEN_SYMBOL = 'zuna';
const SELLER_PERCENT_PROFIT = 80;
const SALE_COMMISSION = 20;

class SecondaryMarket {

  init() {
    this._setMaxOrder();
  }

  _requireAuth(account) {
    if (!blockchain.requireAuth(account, "active")) {
      throw "require account authentication";
    }
    return true;
  }

  _requireOwner() {
    if(!blockchain.requireAuth(blockchain.contractOwner(), 'active')){
      throw 'Require auth error:not contractOwner';
    }
  }

  _validateContract(contractID) {
    if(contractID.length < 51 || contractID.indexOf("Contract") != 0){
      throw "Invalid contract ID.";
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

  _getGlobal(contract, key, d, parse){
    const val = storage.globalGet(contract, key);
    if (val === null || val === "" || val === false) {
      return d;
    }
    if(parse === false){
      return val;
    }else{
      return JSON.parse(val);
    }
  }

  _f(f){
    if(f === "NaN"){
      return 0
    }
    return new Float64(f);
  }

  _equal(val1, val2, err) {
    if (val1 === val2) throw err;
  }

  _notEqual(val1, val2, err) {
    if (val1 !== val2) throw err;
  }

  _ltF(val1, val2, err) {
    if (this._f(val1).lt(val2)) throw err;
  }

  _addOrderCount(count){
    this._put("ORDERCOUNT", this._getOrderCount() + count);
    this._addOrderId(1);
  }

  _addOrderId(count){
    const orderId = this._getOrderId() + count;
    this._put("ORDERID", orderId);
    return orderId;
  }

  _addBuyOrder(account, orderData) {
    const userData = this._getUserData(account);
    userData.totalBuy ++;
    this._setUserData(account, userData);
  }

  _addUserBuySell(account, orderId, checkOrderLimit=false) {
    const userData = this._getUserData(account);
    if (checkOrderLimit) {
      this._equal(
        this._checkOrderLimit(userData),
        true,
        "Maximum number of sell orders have been reached"
      )
    }
    userData.sellOrders.push(orderId);
    userData.sellOrderCount ++;
    this._setUserData(account, userData);
  }

  _addRemoveOrder(account, orderData) {
    const userData = this._getUserData(account);
    userData.totalSell ++;
    if(userData.sellOrderCount > 0){
      userData.sellOrderCount -= 1;
    }
    const idx = userData.sellOrders.indexOf(orderData.orderId);
    if (idx == -1) {
      throw "Order id: " + orderData.orderId + " is not found.";
    }
    userData.sellOrders.splice(idx, 1);
    this._setUserData(account, userData);
  }

  _checkBalance(account, orderData) {
    return this._f(
      blockchain.call("token.iost", "balanceOf", [orderData.symbol, account])[0]
    );
  }

  _getUserData(account) {
    const userData = {
      totalBuy: 0,
      totalSell: 0,
      sellOrderCount: 0,
      sellOrders: [],
    }
    return this._mapGet('userData', account, userData, true);
  }

  _getContract(key, desc="NFT") {
    const contract = this._get(key, null);
    this._equal(contract, null, "The " + desc  + " ContractID is not set.");
    return contract;
  }

  _getNFT(){
    return this._getContract(NFT_CONTRACT_ID);
  }

  _getDao() {
    return this._getContract(DAO_CONTRACT_ID, "DAO");
  }

  _getOrderCount(){
    return this._get("ORDERCOUNT", 0);
  }

  _getOrderId(){
    return this._get("ORDERID", 1, 0);
  }

  _getSellOrder(orderId){
    const sellOrder = this._get("SELLORDER." + orderId, null, true);
    this._equal(sellOrder, null, "Invalid orderId.");
    return sellOrder;
  }

  _getTokenInfo(tokenID) {
    const tokenInfo = this._getGlobal(this._getNFT(), 'znft.'+ tokenID, null, true);
    this._equal(tokenInfo, null, "token ID does not exist.");
    this._isOwnerOfToken(tokenInfo);
    return tokenInfo;
  }

  _isOwnerOfToken(tokenInfo) {
    this._notEqual(tokenInfo.owner, tx.publisher, "Operation not allowed.");
    return true;
  }

  _removeOrder(orderID) {
    this._remove("SELLORDER." + orderID);
  }

  _remove(k) {
    storage.del(k);
  }

  _safeTransfer(from, to, amount, symbol, memo){
    this._notEqual(symbol, TOKEN_SYMBOL, "symbol not supported");
    blockchain.callWithAuth("token.iost", "transfer", [symbol, from, to, amount, memo]);
  }

  _setContract(contractID, key) {
    this._requireOwner();
    this._validateContract(contractID);
    this._put(key, contractID);
  }

  _setMaxOrder(maxNumber=5) {
    this._requireOwner();
    this._put("MAXORDERCOUNT", maxNumber);
  }

  setNFT(contractID) {
    this._setContract(contractID, NFT_CONTRACT_ID);
  }

  setDao(contractID) {
    this._setContract(contractID, DAO_CONTRACT_ID);
  }

  setMaxOrder(maxNumber) {
    this._setMaxOrder(maxNumber);
  }

  _setSellOrder(orderId, orderData){
    this._put("SELLORDER." + orderId, orderData);
  }

  _setUserData(account, data){
    this._mapPut("userData", account, data);
  }

  _holdBuyerFund(account, orderData, memo) {
    this._safeTransfer(
      account,
      orderData.owner,
      this._f(orderData.price).toFixed(2),
      orderData.symbol, memo
    );
  }

  _sellerProfit(orderData, memo) {
    this._safeTransfer(
      orderData.owner,
      orderData.creator,
      this._f(orderData.price).multi(SELLER_PERCENT_PROFIT/100).toFixed(2),
      orderData.symbol, memo
    );
  }

  _checkOrderLimit(userData) {
    if(userData.sellOrderCount >= this._get("MAXORDERCOUNT", 0, 0)) return true;
    return false;
  }

  _saleCommision(price) {
    return this._f(price).multi(SALE_COMMISSION/100).div(2).toFixed(2);
  }

  _DaoFee(contract, orderData) {
    const memo = 'FEE-TO-DAO-' +
      orderData.nft.contract +
      "-" +
      orderData.nft.tokenId;
    const commision = this._saleCommision(orderData.price);
    this._safeTransfer(
      orderData.owner, contract,
      commision, orderData.symbol, memo
    );
  }

  _burn(orderData) {
    const memo = 'BURN-TO-DEADADDR-' +
      orderData.nft.contract +
      "-" +
      orderData.nft.tokenId;
    const commision = this._saleCommision(orderData.price);
    this._safeTransfer(
      orderData.owner, 'deadaddr',
      commision, orderData.symbol, memo
    );
  }

  _transfer(from, to, orderData, desc="SECONDARY-MARKET-SELL-") {
    const memo = desc + orderData.nft.contract + "-" + orderData.nft.tokenId;
    const args = [orderData.nft.tokenId, from, to, "1", memo];
    blockchain.callWithAuth(
      orderData.nft.contract, 'transfer', JSON.stringify(args)
    );
  }

  _sellToken(tokenID, price) {
    const tokenInfo = this._getTokenInfo(tokenID, tx.publisher);
    const orderId = this._getOrderId();
    const userData = 
    this._addOrderCount(1);
    const owner = blockchain.contractName();
    const orderData = {
      orderId: orderId,
      creator: tx.publisher,
      owner: owner,
      nft: {
        tokenId: tokenInfo.id,
        pushPower: tokenInfo.pushPower,
        ability: tokenInfo.ability,
        contract: this._getNFT(),
	url: tokenInfo.url,
      },
      price: price,
      buyer : null,
      symbol : TOKEN_SYMBOL,
      orderTime : block.time,
    }
    this._setSellOrder(orderId, orderData);
    this._addUserBuySell(orderData.creator, orderData.orderId, true);
    this._addUserBuySell(orderData.owner, orderData.orderId);
    return orderData;
  }

  sellToken(tokenID, price) {
    const orderData = this._sellToken(tokenID, price);
    this._transfer(orderData.creator, orderData.owner, orderData);
  }

  _buyToken(orderID) {
    const caller = tx.publisher
    const orderData = this._getSellOrder(orderID);
    this._equal(caller, orderData.creator, "Token belongs to you.");
    this._ltF(
      this._checkBalance(caller, orderData),
      this._f(orderData.price).toFixed(2),
      "Your " + orderData.symbol + " balance is not enough"
    );
    const memo = 'BUY-'+ orderData.nft.contract + "-" +  orderData.nft.tokenId;
    this._holdBuyerFund(caller, orderData, memo);
    this._sellerProfit(orderData, memo);
    this._DaoFee(this._getDao(), orderData);
    this._burn(orderData);
    this._addBuyOrder(caller, orderData);
    this._addRemoveOrder(orderData.creator, orderData);
    this._addRemoveOrder(orderData.owner, orderData);
    this._removeOrder(orderID);
    blockchain.receipt(
      JSON.stringify([orderData.nft.tokenId, 'Buying token is successful.'])
    );
    this._transfer(
      blockchain.contractName(),
      caller,
      orderData,
      "SECONDARY-MARKET-BUY-"
    );
    return;
  }

  buyToken(orderID) {
    this._buyToken(orderID);
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active");
  }
}
module.exports = SecondaryMarket;
