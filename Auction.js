const NFT_CONTRACT_ID = 'NFT_CONTRACT';
const TOKEN_SYMBOL = 'zuna';
const NFT_CONTRACT_KEY  = 'zid';
const NFT_KEY = 'znft.';
const MAX_ORDER_COUNT = 'MAX_ORDER_COUNT';
const ORDER_ID_KEY = 'ORDERID';
const ORDER_COUNT_KEY = "ORDERCOUNT";
const ORDER_BASE = 'ORDER.';
const NFT_DATA_BASE = 'ORDER_DATA.';
const NFT_AUCTION_KEY = "NFT_ORDERS";
const DATE_KEY = "DATE_STARTED";
const PRICE_KEY = "CURRENT_PRICE";
const MINT_PERCENTAGE_KEY = "MINT_PERCENTAGE";
const INITIAL_PRICE_KEY = "INITIAL_PRICE";
const AUCTION_EXPIRY_KEY = "EXPIRY";

const extendTime = 3600;
const lockTime = 3600;

const fixed = 2;
const fixFee = 5;
const feeRate = new Float64(0.05);
const saleRate = new Float64(0.1);
const cpRate = new Float64(0.1);

const saleDepositTotalKey = "depositTotal_";
const saleDepositUserKey = "depositUser_";
const tradeTotal = "tradeTotal_";
const tradeUser = "tradeUser_";

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
    return true;
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
    return storage.mapGet(k, f);
  }

  _mapPut(k, f, v, p, stringify) {
    storage.mapPut(k, f, v.toString());
  }

  _setPutAmount(key, symbol, amount){
    const kn = key + symbol;
    var v = this._get(kn);
    if(v) {
        amount = this._plus(v, amount, fixed);
    }
    this._put(kn, amount);
  }

  _setMPutAmount(key, symbol, amount, field){
      const kn = key + symbol;
      var v = this._mapGet(kn, field);
      if(v) {
        amount = this._plus(v, amount, fixed)
      }
      this._mapPut(kn, field, amount);
  }

  _rmPutAmount(key, symbol, amount){
      const kn = key + symbol;
      var v = this._get(kn);
      if(v) {
        this._ltF(v, amount, "Amount not allowed");
        amount = this._minus(v, amount, fixed);
        this._put(kn, amount);
        return;
      }
      throw new Error("Get put key: " + kn + " is empty" );
  }

  _rmMPutAmount(key, symbol, amount, field){
    const kn = key + symbol;
    var v = this._mapGet(kn, field);
    if(v) {
      this._ltF(v, amount, "Amount is not allowed");
      amount = this._minus(v, amount, fixed)
      this._mapPut(kn, field, amount);
      return;
    }
    throw new Error("Get mput key: " + kn + " is empty" );
  }

  _globalHas(contract, key){
    return storage.globalHas(contract, key);
  }

  _getGlobal(contract, key){
    return storage.globalGet(contract, key);
  }

  _getNFT(){
    const nftContractId = this._get(NFT_CONTRACT_ID, "null");
    if (nftContractId == "null"){
      throw new Error("The NFT ContractID is not yet loaded.");
    }
    return nftContractId;
  }

  _getNFTInfo(contract, id) {
    const key = NFT_KEY + id;
    if (this._globalHas(contract, key) == false){
      throw "NFT token id does not exist!";
    }
    return JSON.parse(this._getGlobal(contract, key));
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
    return this._get(ORDER_BASE + orderId);
  }

  _getOrderCount(){
    return this._get(ORDER_COUNT_KEY, 0);
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

  _setOrderList(account) {
    let order = this._get(NFT_AUCTION_KEY, {'orders': [] } , 0);
    const orderList = NFT_DATA_BASE + account;
    if(!order.orders.includes(orderList)) {
      order.orders.push(orderList);
    };
    this._put(NFT_AUCTION_KEY, order);
  }

  _addUserSale(account, orderId) {
    const userData = this._getUserData(account);
    this._checkOrderLimit(userData);

    if(userData){
      userData.orders.push(orderId);
      userData.orderCount ++;
    }

    this._setUserData(account, userData);
  }

  _addUserBid(account, orderId){
    const userData = this._getUserData(account);
    this._checkOrderLimit(userData);

    userData.bids.push(orderId);
    userData.bidCount ++;

    this._setUserData(account, userData);
  }

  _removeUserSaleBids(account, orderId, condition=saleOrder){
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

  _removeOrderList(account) {
    const userData = this._getUserData(account);
    const order = this._get(NFT_AUCTION_KEY);
    const orderList = NFT_DATA_BASE + account;
    for(let i=0; i<order.orders.length; ++i){
      if(order.orders[i] === orderList && userData.orderCount === 0){
        order.orders.splice(i, 1);
        break;
      }
    }
    this._put(NFT_AUCTION_KEY, order);
  }

  _getUserData(account){
    let userData = this._get(NFT_DATA_BASE + account);
    if(userData){
      return userData;
    }else{
      userData = {
          totalBuy: 0,
          totalSell: 0,
          orderCount: 0,
          orders: [],
          bidCount: 0,
          bids: []
      }
      return userData;
    }
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
    const txTime = (timeStamp)? timeStamp: tx.time;
    this._put(DATE_KEY, txTime);
  }

  _setInitialPrice() {
    this._put(INITIAL_PRICE_KEY, 1);
  }

  _setPrice(price=1) {
    this._put(PRICE_KEY, price);
  }

  _setPricePerMint(percent) {
    this._put(MINT_PERCENTAGE_KEY, percent);
  }

  _setMaxOrder(maxNumber=30) {
    this._put(MAX_ORDER_COUNT, maxNumber);
  }

  _getInitialPrice() {
    this._get(INITIAL_PRICE_KEY);
  }

  _getPrice() {
    return this._get(PRICE_KEY);
  }

  _getPricePerMint() {
    this._get(MINT_PERCENTAGE_KEY);
  }

  _getDate() {
    return this._get(DATE_KEY);
  }

  _setExpiry(expiry=86400){
    this._put(AUCTION_EXPIRY_KEY, expiry);
  }

  _getExpiry() {
    const expiry = this._get(AUCTION_EXPIRY_KEY);
    return tx.time +(Math.floor(expiry) * 1e9);
  }

  _extendExpiry(expiry){
    return expiry + (extendTime * 1e9);
  }

  _getDays(timestamp=tx.time) {
    return Math.floor((timestamp - Math.floor(this._getDate())) / (1e9 * 3600 * 24));
  }

  _checkPrice() {
    let initialPrice = this._getInitialPrice();
    if(!initialPrice) {
      initialPrice = this._f("1.00").toFixed(fixed);
      this._setInitialPrice();
    }
    let pricePerMint = this._getPricePerMint();
    if (!pricePerMint) {
	pricePerMint = this._f("0.01").toFixed(fixed);
        this._setPricePerMint(pricePerMint);
    }

    const price = initialPrice * (this._getDays()==0) ? 1: this._getDays();
    const mintedPrice = this._multi(price, pricePerMint, fixed);
    this._setPrice(this._plus(price, mintedPrice, fixed));
    return this._getPrice();
  }

  _safeTransfer(from, to, amount, symbol, memo){
    this._symbcheck(symbol);
    blockchain.callWithAuth("token.iost", "transfer", [symbol, from, to, amount, memo])
  }

  _f(f){
    if(f === "NaN"){
      return 0
    }
    return new Float64(f);
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

  _isExpired(orderId) {
    const orderData = this._getOrder(orderId);
    if (orderData.expire !== null && (tx.time >= orderData.expire)) {
      return true;
    }
    return false;
  }

  _checkOrderLimit(userData) {
    if(userData && userData.orderCount >= this._get(MAX_ORDER_COUNT, 0, 0)){
      throw "Maximum number of orders have been reached";
    }
  }

  _mint() {
    blockchain.call(
      this._getNFT(),
      "mint",
      []
    )[0];
  }

  _isOwnerBidder(orderId) {
    const caller = tx.publisher;
    this._requireAuth(caller);
    const orderData = this._getOrder(orderId);
    return (caller == orderData.owner || caller == orderData.bidder);
  }

  _unclaim(account) {
    var userData = this._getUserData(account);
    const orders = userData.orders;
    orders.forEach(
      (orderId)=> {
        if (this._isExpired(orderId) === true && this._isOwnerBidder(orderId) === true) {
          this.claim(orderId);
	}
      }
    );
  }

  _setAuction() {
    blockchain.call(
      this._getNFT(),
      "setAuction",
      [blockchain.contractName().toString()]
    )[0];
  }

  _unsale(orderId){
    this._requireOwner();
    const orderData = this._getOrder(orderId);
    this._notData(orderData, "Unsale order " +  orderId + " does not exist");
    this._unclaim(orderData.owner);
    this._notEqual(null, orderData.bidder, "Order "+ orderId + " had bidder, can't retract ");
    this._lt(tx.time, orderData.expire, "Order " + orderId + "is in trading");

    const memo = 'AUC-UNSALE-' + orderData.contract + "-" + orderData.tokenId;
      var unsaleArgs = [
          orderData.tokenId.toString(),
          blockchain.contractName(),
          orderData.owner,
          "1",
          memo
      ];
    blockchain.callWithAuth(orderData.contract, 'transfer', JSON.stringify(unsaleArgs));

    const unfreezeTime = tx.time + lockTime*1e9;
    const freezeMemo = ('AUC-UNSALE-DELAYED-WITHDRAW-' + orderData.symbol + "-to-" +
      orderData.owner + "-" + orderData.deposit + "-" + unfreezeTime);
    const freezeArgs = [
        orderData.symbol,
        blockchain.contractName(),
        orderData.owner,
        orderData.deposit,
        unfreezeTime,
        freezeMemo
    ];
    blockchain.callWithAuth("token.iost", "transferFreeze", JSON.stringify(freezeArgs));

    //sub from all deposit
    this._rmPutAmount(saleDepositTotalKey, orderData.symbol, orderData.deposit);

    //sub from user
    this._rmMPutAmount(saleDepositUserKey, orderData.symbol, orderData.deposit, orderData.owner);

    this._removeUserSaleBids(orderData.owner, orderData.orderId, saleOrder);
    this._removeOrder(orderId);
    this._removeOrderList(orderData.owner);

    return;
  }

  _sale(tokenId){
    const contract = this._getNFT();
    const price = this._f(this._checkPrice()).toFixed(fixed);
    const symbol = TOKEN_SYMBOL;
    const orderAccount = tx.publisher;
    this._unclaim(orderAccount);
    const contractInfo = this._getNFTInfo(contract, tokenId);
    const deposit = this._multi(price, saleRate, fixed); //deposit to fixed to 2 rtn=>string
    this._lteF(price, "0", "sale price must > 1 " +  symbol);
    this._lteF(deposit, "0", "sale price must > 1 " + symbol);
    const orderId = this._getOrderId();
    const userData = this._getUserData(orderAccount);

    this._checkOrderLimit(userData);
    this._addOrderCount(1);

    this._safeTransfer(orderAccount, blockchain.contractName(), deposit, symbol,
      "stack sale" + orderId + " margin ")

    this._setPutAmount(saleDepositTotalKey, symbol, deposit);
    this._setMPutAmount(saleDepositUserKey, symbol, deposit, orderAccount);

    const saleMemo = "AUC-SALE-" + contract + "-" + tokenId + "-" + price + "-" + symbol;

    const saleArgs = [
        tokenId.toString(),
        orderAccount,
        blockchain.contractName(),
        "1",
        saleMemo
    ];
    blockchain.callWithAuth(contract, 'transfer', JSON.stringify(saleArgs));

    const orderData = {
      orderId: orderId,
      actionCode: "SALE",
      owner: orderAccount,
      tokenId: contractInfo.id,
      aucPrice: price,
      price: price,
      deposit: deposit,
      contract: contract,
      bidder : null,
      symbol : symbol,
      orderTime : tx.time,
      expire : null
    }
    this._addUserSale(orderAccount, orderId);// add user data (order)
    this._setOrder(orderId, orderData);
    this._setOrderList(orderAccount);
    return;
  }

  sale(tokenId) {
    this._requireOwner();
    return this._sale(tokenId);
  }

  unsale(orderId) {
    this._getNFT();
    return this._unsale(orderId);
  }

  bid(orderId, price) {
    const buyer = tx.publisher;
    this._requireAuth(buyer);
    const contract = this._getNFT();
    const orderData = this._getOrder(orderId);
    this._notData(orderData, "Bid order " +  orderId + " does not exist");
    this._notEqual(orderData.contract, contract, "contract mismatch");
    this._equal(orderData.bidder, buyer, "current bidder is you");
    this._equal(orderData.owner, buyer, "cannot bid yourself asset");
    this._equal(true, this._isExpired(orderId), "Order is expired");
    const minprice = this._f(price).toFixed(fixed);
    this._lteF(minprice, orderData.price, "bid price should be higher");
    this._lteF(orderData.price, "0", "Price check error");
    this._lteF(minprice, "0", "Price check error");

    if(null !== orderData.bidder){
      this._safeTransfer(blockchain.contractName(), orderData.bidder, orderData.price,
        orderData.symbol, "bid order " + orderId + " be surpassed ");
      this._removeUserSaleBids(orderData.bidder, orderId, bidOrder);//delete last bidder
    }
    orderData.price = minprice;
    orderData.bidder = buyer;
    orderData.orderTime = tx.time;
    orderData.expire = (orderData.expire===null) ? this._getExpiry(): this._extendExpiry(
      orderData.expire);
    this._setOrder(orderId, orderData);

    const accountIOSTMoney = blockchain.callWithAuth("token.iost", "balanceOf", [
      orderData.symbol,
      buyer])[0];
    this._ltF(accountIOSTMoney, orderData.price,
      "Your " + orderData.symbol + " balance is not enough");

    const memo = 'AUCBUY-'+ orderData.contract + "-" +  orderData.tokenId;
    this._safeTransfer(buyer, blockchain.contractName(), orderData.price, orderData.symbol, memo);
    this._addUserBid(buyer, orderId);//add  this bidder
    this._unclaim(orderData.owner);
    return;
  }


  claim(orderId) {
    const caller = tx.publisher;
    this._requireAuth(caller);
    const orderData = this._getOrder(orderId);
    this._notData(orderData, "Claim order "+ orderId  + " does not exist");
    this._lte(tx.time, orderData.expire, "order in auction");
    this._isNull(orderData.bidder, "order no bidder");
    if(caller !== orderData.owner && caller !== orderData.bidder) {
        throw "Authorization failed.";
    }

    const marketFee = this._multi(orderData.price, feeRate, fixFee);
    this._lteF(marketFee, "0", "marketFee amount error");
    const fee = this._f(marketFee).toFixed(fixFee);
    this._gteF(fee, orderData.price, "Owner amount error");
    const ownerFee = this._minus(orderData.price, fee, fixFee);
    const nftMemo = 'AUC-TO-OWNER-' + orderData.contract + "-" +  orderData.tokenId;
    this._safeTransfer(blockchain.contractName(), orderData.owner, ownerFee,
      orderData.symbol, nftMemo);

    const transferMemo = 'AUC-CLAIM-' + orderData.contract + "-" +  orderData.tokenId;
    const nftArgs = [
        orderData.tokenId.toString(),
        blockchain.contractName(),
        orderData.bidder,
        "1",
        transferMemo
    ];
    blockchain.callWithAuth(orderData.contract, 'transfer', JSON.stringify(nftArgs));

    this._setTotalSell(orderData.owner);
    this._setTotalBuy(orderData.bidder);

    const unfreezeTime = tx.time + lockTime*1e9;
    const freezeMemo = ('AUC-DELAYED-WITHDRAW-' + orderData.symbol + "-to-" + orderData.owner +"-"
      + orderData.deposit + "-" + unfreezeTime);
    const freezeArgs = [
      orderData.symbol,
      blockchain.contractName(),
      orderData.owner,
      orderData.deposit,
      unfreezeTime,
      freezeMemo
    ];

    blockchain.callWithAuth("token.iost", "transferFreeze", JSON.stringify(freezeArgs));

    //sub from all deposit
    this._rmPutAmount(saleDepositTotalKey, orderData.symbol, orderData.deposit);

    //sub from user
    this._rmMPutAmount(saleDepositUserKey, orderData.symbol, orderData.deposit, orderData.owner);

    this._setPutAmount(tradeTotal, orderData.symbol, orderData.price);
    this._setMPutAmount(tradeUser, orderData.symbol, orderData.price, orderData.bidder);
    this._setMPutAmount(tradeUser, orderData.symbol, orderData.price, orderData.owner);

    this._removeUserSaleBids(orderData.owner, orderId, saleOrder);
    this._removeUserSaleBids(orderData.bidder, orderId, bidOrder);
    this._removeOrder(orderId);
    this._removeOrderList(orderData.owner);
    this._mint();

    return;
  }

  _setNFT(contractID) {
    this._put(NFT_CONTRACT_ID, contractID, tx.publisher);
  }

  _setAuction() {
    blockchain.call(
      this._getNFT(),
      "setAuction",
      [blockchain.contractName()]
    )[0];
  }

  _generateInitialNFT() {
    blockchain.call(
      this._getNFT(),
      "generateInitialNFT",
      []
    )[0];
  }

  setNFT(contractID) {
    this._requireOwner();
    if (this._globalHas(contractID, NFT_CONTRACT_KEY) == false) {
      throw "NFT ContractID doest not exist!";
    }
    this._setNFT(contractID);
    this._setAuction();
    this._generateInitialNFT();
  }

  rmOrder(orderId) {
     this._requireAuth(tx.publisher);
     this._unsale(orderId);
     return;
  }

  rmStorage(key){
    this._requireOwner();
    this._remove(key);
    return;
  }

  setDate(timestamp) {
    this._requireOwner();
    this._setDate(Math.floor(timestamp));
    return;
  }

  setPrice(price) {
    this._requireOwner();
    this._setPrice(price);
    return;
  }

  setMaxOrder(maxNumber) {
    this._requireOwner();
    this._setMaxOrder(maxNumber);
    return;
  }

  setPricePerMint(percent) {
    this._requireOwner();
    this._setPricePerMint(percent);
    return;
  }

  setExpiry(expiry) {
    this._requireOwner();
    this._setExpiry(expiry);
    return;
  }

  can_update(data) {
    return this._requireOwner();
  }

};
module.exports = Auction;
