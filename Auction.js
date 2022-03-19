const UNCLAIMED_ORDER_KEY = 'UNCLAIMED_ORDERS';
const NFT_CONTRACT_ID = 'NFT_CONTRACT';
const DAO_CONTRACT_ID = 'DAO_CONTRACT';
const TOKEN_SYMBOL = 'zuna';
const MAX_ORDER_COUNT = 'MAX_ORDER_COUNT';
const ORDER_ID_KEY = 'ORDERID';
const ORDER_COUNT_KEY = "ORDERCOUNT";
const ORDER_BASE = 'ORDER.';
const NFT_DATA_BASE = 'ORDER_DATA.';
const NFT_AUCTION_KEY = "NFT_SELLERS";
const DATE_KEY = "DATE_STARTED";
const PRICE_KEY = "CURRENT_PRICE";
const PRICE_PER_MINT_KEY = "PRICE_PER_MINT";
const INITIAL_PRICE_KEY = "INITIAL_PRICE";
const AUCTION_EXPIRY_KEY = "EXPIRY";
const AUCTION_FEE_RATE = "FEE_RATE";

const fixed = 2;

const saleOrder = 'order';
const bidOrder = 'bid';

class Auction {
  init() {
    this._setDate();
    this._setExpiry();
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

  _globalHas(contract, key){
    return storage.globalHas(contract, key);
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

  _getNFT(){
    const contract = this._get(NFT_CONTRACT_ID, "null");
    this._equal(contract, "null", "The NFT ContractID is not set.");
    return contract;
  }

  _getNFTInfo(contract, id) {
    const key = 'znft.' + id;
    this._equal(this._globalHas(contract, key), false, "NFT token id does not exist!");
    return this._getGlobal(contract, key, 0, true);
  }

  _getDao() {
    const contract = this._get(DAO_CONTRACT_ID, null, 0);
    this._equal(contract, null, "The Dao ContractID is not set.");
    return contract;
  }

  _getOrderId(){
    const orderId = this._get(ORDER_ID_KEY);
    if(orderId){
        return orderId;
    }else{
        return 1;
    }
  }

  _getOrder(orderId){
    return this._get(ORDER_BASE + orderId, null, true);
  }

  _getOrderCount(){
    return this._get(ORDER_COUNT_KEY, 0);
  }

  _getRequest() {
    return JSON.parse(blockchain.contextInfo());
  }

  _addOrderCount(count){
    this._put(ORDER_COUNT_KEY, this._getOrderCount() + count);
    this._addOrderId(1);
  }

  _addOrderId(count){
    if(count <= 0){
        throw new Error("add order count must positive");
    }
    const orderId = this._getOrderId() + count;
    this._put(ORDER_ID_KEY, orderId);
    return orderId;
  }

  _addUserSale(account, orderId) {
    const userData = this._getUserData(account);
    this._equal(this._checkOrderLimit(userData), true,
      "Maximum number of orders have been reached");

    if(userData){
      userData.orders.push(orderId);
      userData.orderCount ++;
    }

    this._setUserData(account, userData);
  }

  _addUserBid(account, orderId){
    const userData = this._getUserData(account);
    this._equal(this._checkOrderLimit(userData), true,
      "Maximum number of orders have been reached");

    userData.bids.push(orderId);
    userData.bidCount ++;

    this._setUserData(account, userData);
  }

  _addToUnclaim(orderId, account, contract) {
    this._removeUserSaleBids(account, orderId, saleOrder);
    let unclaimedOrder = this._getUnclaimedOrder();
    if (unclaimedOrder.indexOf(orderId) == -1){
      unclaimedOrder.push(orderId);
      this._mint(contract, account, orderId);
      this._put(UNCLAIMED_ORDER_KEY, unclaimedOrder);
    }
  }

  _removeUserSaleBids(account, orderId, condition=saleOrder){
    if (condition==saleOrder && this._unclaimedOrderIdxExist(orderId) !== -1) {
      return;
    }
    const userData = this._getUserData(account);
    if(userData.orderCount > 0){
      userData.orderCount -= 1;
    }
    const orderBidLength = (condition==saleOrder) ? userData.orders.length: userData.bids.length;
    let ordersBids = (condition==saleOrder) ? userData.orders : userData.bids;

    let found = false;
    for(let i=0; i<orderBidLength; ++i){
      if(ordersBids[i] === orderId){
         ordersBids.splice(i, 1);
         found = true;
         break;
      }
    }

    if(!found){
      throw "Order id: " + orderId + " is not found.";
    }

    this._setUserData(account, userData);
  }

  _RemoveToUnclaim(orderId) {
    let unclaimedOrder = this._getUnclaimedOrder();
    const idx = unclaimedOrder.indexOf(orderId);
    if (idx !== -1) {
      unclaimedOrder.splice(idx, 1);
      this._put(UNCLAIMED_ORDER_KEY, unclaimedOrder);
    }
  }

  _symbcheck(symbol){
    if(symbol !== TOKEN_SYMBOL){
      throw new Error("symbol not supported");
    }
  }

  _remove(k) {
    storage.del(k);
  }

  _subOrderCount(count){
    let orderCount = this._getOrderCount();
    if(orderCount < count){
      throw new Error("sub order count must positive");
    }
    orderCount -= count;
    this._put(ORDER_COUNT_KEY, orderCount);
  }

  _removeOrder(orderId){
    this._remove(ORDER_BASE + orderId);
    this._subOrderCount(1);
  }

  _getUnclaimedOrder() {
    return this._get(UNCLAIMED_ORDER_KEY, [], true);
  }

  _getUserData(account){
    let userData = this._get(NFT_DATA_BASE + account, null, true);
    if(userData === null){
      userData = {
        totalBuy: 0,
        totalSell: 0,
        orderCount: 0,
        orders: [],
        bidCount: 0,
        bids: []
      }
    }
    return userData;
  }

  _setTotalSell(account) {
    const orderData = this._getUserData(account);
    orderData.totalSell ++;
    this._setUserData(account, orderData);
  }

  _setTotalBuy(account) {
    const orderData = this._getUserData(account);
    orderData.totalBuy ++;
    this._setUserData(account, orderData);
  }

  _setUserData(account, data){
    this._put(NFT_DATA_BASE + account, data);
  }

  _setOrder(orderId, orderData){
    this._put(ORDER_BASE + orderId, orderData);
  }

  _setDate(timeStamp) {
    const txTime = (timeStamp)? timeStamp: block.time;
    this._put(DATE_KEY, txTime);
  }

  _setInitialPrice() {
    this._put(INITIAL_PRICE_KEY, 1);
  }

  _setPrice(price=1) {
    this._put(PRICE_KEY, this._f(price).toFixed(fixed));
  }

  _setPricePerMint(price) {
    this._put(PRICE_PER_MINT_KEY, price);
  }

  _setMaxOrder(maxNumber=9) {
    this._put(MAX_ORDER_COUNT, maxNumber);
  }

  _getInitialPrice() {
    return this._get(INITIAL_PRICE_KEY, 1, false);
  }

  _getPrice() {
    return this._get(PRICE_KEY, 1, true);
  }

  _getPricePerMint() {
    return this._get(PRICE_PER_MINT_KEY, 0, true);
  }

  _getDate() {
    return this._get(DATE_KEY);
  }

  _setExpiry(expiry=3600){
    this._put(AUCTION_EXPIRY_KEY, expiry);
  }

  _getExpiry() {
    const expiry = this._get(AUCTION_EXPIRY_KEY);
    return block.time +(Math.floor(expiry) * 1e9);
  }

  _extendExpiry(expiry){
    return expiry + (Math.floor(this._get(AUCTION_EXPIRY_KEY)) * 1e9);
  }

  _getDays(timestamp=block.time) {
    return Math.floor((timestamp - Math.floor(this._getDate())) / (1e9 * 3600 * 24));
  }

  _checkOrderLimit(userData) {
    if(userData && userData.orderCount >= this._get(MAX_ORDER_COUNT, 0, 0)) return true;
    return false;
  }

  _checkPrice() {
    let initialPrice = this._getInitialPrice();
    if(!initialPrice) {
      initialPrice = this._f("1.00").toFixed(fixed);
      this._setInitialPrice(initialPrice);
    }
    let pricePerMint = this._getPricePerMint();
    if (!pricePerMint) {
	pricePerMint = this._f("0.00").toFixed(fixed);
        this._setPricePerMint(pricePerMint);
    }

    const dailyPrice = initialPrice * (this._getDays()==0) ? 1: this._getDays();
    const totalPrice = this._plus(dailyPrice, pricePerMint, fixed);
    this._setPrice(totalPrice);
    return this._getPrice();
  }

  _safeTransfer(from, to, amount, symbol, memo){
    this._symbcheck(symbol);
    blockchain.callWithAuth("token.iost", "transfer", [symbol, from, to, amount, memo]);
  }

  _f(f){
    if(f === "NaN"){
      return 0
    }
    return new Float64(f);
  }

  _div(fa, n, t) {
    return this._f(fa).div(this._f(n)).toFixed(t);
  }

  _minus(fa, n, t){
    return this._f(fa).minus(this._f(n)).toFixed(t);
  }

  _plus(fa, n, t){
    return this._f(fa).plus(this._f(n)).toFixed(t);
  }

  _multi(fa, n, t){
    return this._f(fa).multi(this._f(n)).toFixed(t);
  }

  _isNull(data, err) {
    if (data === null) throw err;
  }

  _isNotNull(data, err) {
    if (data !== null) throw err;
  }

  _notData(data, err) {
    if (!data) throw err;
  }

  _equal(val1, val2, err) {
    if (val1 === val2) throw err;
  }

  _notEqual(val1, val2, err) {
    if (val1 != val2) throw err;
  }

  _lt(val1, val2, err) {
    if (val1 < val2 ) throw err;
  }

  _lte(val1, val2, err) {
    if (val1 <= val2 ) throw err;
  }

  _gte(val1, val2, err) {
    if (val1 >=val2 ) throw err;
  }

  _ltF(val1, val2, err) {
    if (this._f(val1).lt(val2)) throw err;
  }

  _lteF(val1, val2, err) {
    if (this._f(val1).lte(val2)) throw err;
  }

  _gteF(val1, val2, err) {
    if (this._f(val1).gte(val2)) throw err;
  }

  _unclaimedOrderIdxExist(orderId) {
    const unclaimedOrder = this._getUnclaimedOrder();
    return unclaimedOrder.indexOf(orderId);
  }

  _isExpired(orderData) {
    if (orderData.expire !== null && (block.time >= orderData.expire)) {
      return true;
    }
    return false;
  }

  _mint(contract, account, orderId) {
    const userData = this._getUserData(account);
    const request = this._getRequest();
    if(this._checkOrderLimit(userData) == false && request.caller.is_account
        && this._unclaimedOrderIdxExist(orderId) == -1){
      const tokenId = blockchain.call(contract, "mint", [])[0];
      if (tokenId) this.sale(tokenId);
    }
  }

  _isOwnerBidder(orderData) {
    const caller = tx.publisher;
    return (caller == orderData.creator || caller == orderData.bidder);
  }

  _unclaim(account) {
    const userData = this._getUserData(account);
    userData.orders.forEach(
      (orderId)=> {
        var orderData = this._getOrder(orderId);
        if (this._isExpired(orderData) === true) {
           this._addToUnclaim(orderId, orderData.owner, orderData.contract);
	}
      }
    );
  }

  _unsale(orderId){
    this._requireOwner();
    const orderData = this._getOrder(orderId);
    this._notData(orderData, "Unsale order " +  orderId + " does not exist");
    this._notEqual(null, orderData.bidder, "Order "+ orderId + " had bidder, can't retract ");
    this._lt(block.time, orderData.expire, "Order " + orderId + "is in trading");
    this._removeUserSaleBids(orderData.owner, orderData.orderId, saleOrder);
    this._removeOrder(orderId);
    return;
  }

  _orderExist(orderId) {
    const _getOrders = (account) => {
      const auctions = this._get(account);
      auctions.orders.forEach((id) => {
       var orderData = this._getOrder(id);
        this._equal(orderData.tokenId, orderId, "Token already in Auction.");
      });
      return;
    }
    const jsonData = this._get(NFT_AUCTION_KEY, 0);
    if(jsonData) {
      jsonData.orders.forEach((account) => {
        _getOrders(account);
      });
    }
  }

  _isInAuction(contract, tokenId) {
    const tokenOwner = this._getGlobal(contract, 'zun.'+ tokenId, 0, true);
    this._equal(tokenOwner, 0, "token not found");
    if (tokenOwner == blockchain.contractName()) {
      this._orderExist(tokenId);
      return;
    }
    throw "Put this token into an auction is prohibited.";

  }

  _sale(tokenId, publisher=false){
    const contract = this._getNFT();
    const contractOwner = blockchain.contractOwner();
    this._isInAuction(contract, tokenId);
    const price = this._f(this._checkPrice()).toFixed(fixed);
    const symbol = TOKEN_SYMBOL;
    const creator = (publisher) ? blockchain.contractOwner() : tx.publisher;
    const orderAccount = (publisher) ? blockchain.contractName() : tx.publisher;
    const contractInfo = this._getNFTInfo(contract, tokenId);
    this._lteF(price, "0", "sale price must > 1 " +  symbol);
    const orderId = this._getOrderId();
    const userData = this._getUserData(orderAccount);
    this._addOrderCount(1);

    const orderData = {
      orderId: orderId,
      actionCode: "SALE",
      creator: creator,
      owner: orderAccount,
      tokenId: contractInfo.id,
      aucPrice: price,
      price: price,
      contract: contract,
      bidder : null,
      symbol : symbol,
      orderTime : block.time,
      expire : null
    }
    this._addUserSale(orderAccount, orderId);
    this._setOrder(orderId, orderData);
    return;
  }

  sale(tokenId) {
    this._requireAuth(tx.publisher);
    return this._sale(tokenId, true);
  }

  unsale(orderId) {
    return this._unsale(orderId);
  }

  _checkBalance(orderData) {
    return this._f(blockchain.call("token.iost", "balanceOf", [
      orderData.symbol, orderData.bidder])[0]);
  }

  bid(orderId, price) {
    const buyer = tx.publisher;
    const orderData = this._getOrder(orderId);
    this._notData(orderData, "Bid order " +  orderId + " does not exist");
    this._equal(orderData.bidder, buyer, "current bidder is you");
    this._equal(orderData.creator, buyer, "cannot bid yourself asset");
    this._equal(true, this._isExpired(orderId), "Order is expired");
    const minprice = this._f(price).toFixed(fixed);
    this._lteF(minprice, orderData.price, "bid price should be higher");
    this._lteF(orderData.price, "0", "Price check error");
    this._lteF(minprice, "0", "Price check error");

    if(null !== orderData.bidder){
      this._safeTransfer(blockchain.contractName(), orderData.bidder, this._f(orderData.price),
        orderData.symbol, buyer + " is the new bidder for order " + orderId);
      this._removeUserSaleBids(orderData.bidder, orderId, bidOrder);
    }
    orderData.price = minprice;
    orderData.bidder = buyer;
    orderData.orderTime = block.time;
    orderData.expire = (orderData.expire===null) ? this._getExpiry(): this._extendExpiry(
      orderData.orderTime);
    this._setOrder(orderId, orderData);
    this._ltF(this._checkBalance(orderData), minprice,
      "Your " + orderData.symbol + " balance is not enough");
    const memo = 'AUCBUY-'+ orderData.contract + "-" +  orderData.tokenId;
    this._safeTransfer(buyer, blockchain.contractName(), minprice, orderData.symbol, memo);
    this._addUserBid(buyer, orderId);
    return;
  }

  _DaoFee(contract, orderData) {
    const memo = 'AUC-FEE-TO-DAO-' + orderData.contract + "-" +  orderData.tokenId;
    this._safeTransfer(orderData.owner, contract,
      this._div(orderData.price, 2, fixed), orderData.symbol, memo);
  }

  _burn(orderData) {
    const memo = 'AUC-BURN-TO-DEADADDR-' + orderData.contract + "-" +  orderData.tokenId;
    this._safeTransfer(orderData.owner, 'deadaddr',
      this._div(orderData.price, 2, fixed), orderData.symbol, memo);
  }

  _claim(orderId, triggered=false) {
    const caller = tx.publisher;
    const orderData = this._getOrder(orderId);
    this._notData(orderData, "Claim order "+ orderId  + " does not exist");
    this._lte(block.time, orderData.expire, "order in auction");
    this._isNull(orderData.bidder, "order no bidder");
    if(!this._isOwnerBidder(orderData) && triggered==false) throw "Authorization failed.";
    const contract = this._getDao();
    const memo = 'AUC-CLAIM-' + orderData.contract + "-" +  orderData.tokenId;
    const args = [orderData.tokenId, orderData.owner, orderData.bidder, "1", memo];
    blockchain.callWithAuth(orderData.contract, 'transfer', JSON.stringify(args));

    this._setTotalSell(orderData.owner);
    this._setTotalBuy(orderData.bidder);
    this._removeUserSaleBids(orderData.owner, orderId, saleOrder);
    this._removeUserSaleBids(orderData.bidder, orderId, bidOrder);
    this._removeOrder(orderId);
    this._DaoFee(contract, orderData);
    this._burn(orderData);
    this._mint(orderData.contract, orderData.owner, orderId);
    this._RemoveToUnclaim(orderId);
    return;
  }

  claim(orderId) {
    this._claim(orderId);
  }

  _validateContract(contractID) {
    if(contractID.length < 51 || contractID.indexOf("Contract") != 0){
      throw "Invalid contract ID.";
    }
  }

  _setNFT(contractID) {
    this._validateContract(contractID);
    this._put(NFT_CONTRACT_ID, contractID, tx.publisher);
  }

  setNFT(contractID) {
    this._requireOwner();
    this._setNFT(contractID);
  }

  setDao(contractID) 
  {
    this._requireOwner();
    this._validateContract(contractID);
    this._put(DAO_CONTRACT_ID, contractID);
  }

  setDate(timestamp) {
    this._requireOwner();
    this._setDate(Math.floor(timestamp));
    return;
  }

  setMaxOrder(maxNumber) {
    this._requireOwner();
    this._setMaxOrder(maxNumber);
    return;
  }

  setPricePerMint(price) {
    this._requireOwner();
    this._setPricePerMint(price);
    return;
  }

  setExpiry(expiry) {
    this._requireOwner();
    this._setExpiry(expiry);
    return;
  }

  unclaimedOrders() {
    this._requireOwner();
    this._unclaim(blockchain.contractName());
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active");
  }

};
module.exports = Auction;
