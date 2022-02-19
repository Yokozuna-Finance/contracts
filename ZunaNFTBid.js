const NFT_CONTRACT_ID = "NFTCONTRACTID";
const NFT_CONTRACT_KEY  = "zid";
const NFT_KEY = "znft.";
const ZUNAFEE = 'adminfee';
const USER_MAX_ORDER_COUNT = 30;
const ORDER_ID_KEY = "ORDERID";
const ORDER_COUNT_KEY = "ORDERCOUNT";
const CONTRACT_ENABLE_KEY = "CONTRACTENABLE";
const LOG_ID = "LOGID";
const LOG_BASE = "LOG."
const ORDER_BASE = "ORDER.";
const NFT_DATA_BASE = "NFTDATA.";

// const expiry = 86400; // 24hours
// const extendTime = 3600; // 1hour
const expiry = 20;
const extendTime = 20;
const lockTime = 259200;

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

class ZunaNFTBid {

  init() {}

  _requireAuth(account) {
    if (!blockchain.requireAuth(account, "active")) {
      throw "require account authentication";
    }
  }

  _requireOwner() {
    if(!blockchain.requireAuth(blockchain.contractOwner(), 'active')){
      throw 'Require auth error:not contractOwner';
    }
  }

  can_update(data) {
    this._requireOwner()
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
        return
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
      return
    }
    throw new Error("Get mput key: " + kn + " is empty" );
  }

  _msg(code, msg, obj) {
    var success;
    if (code == 200) {
      success = true;
    } else {
      success = false;
    }
    var message = {
      code: code,
      message: msg,
      success: success,
      object: obj
    }
    return message;
  }

  _globalHas(contract, key){
    return storage.globalHas(contract, key);
  }

  _getGlobal(contract, key){
    return storage.globalGet(contract, key);
  }

  _getNFTContract(){
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

  _addUserSale(account, orderId) {
    const userData = this._getUserData(account);
    if(userData){
      userData.orders.push(orderId);
      userData.orderCount ++;
    }

    this._setUserData(account, userData);
  }

  _addUserBid(account, orderId){
    const userData = this._getUserData(account);

    if(userData && userData.orderCount >= USER_MAX_ORDER_COUNT){
      throw new Error("You can only hang "+ USER_MAX_ORDER_COUNT +" orders");
    }
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
      throw new Error(orderId);
    }

    this._setUserData(account, userData);
  }

  _symbcheck(symbol){
    if(symbol !== 'iost'){
      throw new Error("symbol not support");
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

  _getUserData(account){
    let userData = this._get(NFT_DATA_BASE + account);
    if(userData){
      return userData;
    }else{
      userData = {
          totalBuy : 0,
          totalSell : 0,
          stackVolumn : 0,
          orderCount :0,
          orders:[],
          bidCount:0,//Invalid data?
          bids:[],
          marginFund: {}
      }
      return userData;
    }
  }

  _setUserData(account, data){
    this._put(NFT_DATA_BASE + account, data);
  }

  _setOrder(orderId, orderData){
    this._put(ORDER_BASE + orderId, orderData);
  }

  _getExpiry(){
    return tx.time + expiry * 1e9;
  }

  _extendExpiry(expiry){
    return expiry + extendTime * 1e9;
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

  _notIn(val, varArr, err) {
    if (!varArr.includes(val)) throw err;
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

  _getPcen(cate){
    if(cate === 1){
      return 1.1
    }else if(cate === 2){
      return 1.5
    }else{
      throw new Error("error cate");
    }
  }

  _unsale(orderId){
    const orderData = this._getOrder(orderId);
    this._notData(orderData, "Unsale order " +  orderId + " does not exist");
    this._requireOwner(orderData.owner);
    this._notEqual(null, orderData.bidder, "Order "+ orderId + " had bidder, can't retract ");
    this._lt(tx.time, orderData.expire, "Order " + orderId + "is in trading");

    const memo = 'AUC-UNSALE-' + orderData.contract + "-" + orderData.tokenId;
      var unsaleArgs = [
          orderData.tokenId,
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
  }

  sale(tokenId, price, symbol){
    const orderAccount = tx.publisher;
    this._requireOwner(orderAccount);
    const contract = this._getNFTContract();
    const contractInfo = this._getNFTInfo(contract, tokenId);
    var price = this._f(price).toFixed(fixed); //price to fixed to 2  rtn => string
    const deposit = this._multi(price, saleRate, fixed); //deposit to fixed to 2 rtn=>string
    this._lteF(price, "0", "sale price must > 1 IOST");
    this._lteF(deposit, "0", "sale price must > 1 IOST");
    const orderId = this._getOrderId();
    const userData = this._getUserData(orderAccount);

    this._gte(userData.orderCount, USER_MAX_ORDER_COUNT,
      "You can only hang "+ USER_MAX_ORDER_COUNT +" orders");

    this._addOrderCount(1);
    this._safeTransfer(orderAccount, blockchain.contractName(), deposit, symbol,
      "stack sale" + orderId + " margin ")

    this._setPutAmount(saleDepositTotalKey, symbol, deposit);
    this._setMPutAmount(saleDepositUserKey, symbol, deposit, orderAccount);

    const saleMemo = "AUC-SALE-" + contract + "-" + tokenId + "-" + price + "-" + symbol;

    const saleArgs = [
        tokenId,
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
      expire : null,
    }
    this._addUserSale(orderAccount, orderId);// add user data (order)
    this._setOrder(orderId, orderData);
 
  }

  unsale(orderId) {
    this._getNFTContract();
    return this._unsale(orderId);
  }

  bid(orderId, tokenId, per) {
    const buyer = tx.publisher;
    this._requireAuth(buyer);
    const contract = this._getNFTContract();
    const orderData = this._getOrder(orderId);
    this._notData(orderData, "Bid order " +  orderId + " does not exist");
    this._notEqual(orderData.tokenId, tokenId, "token data check error");
    this._notEqual(orderData.contract, contract, "token data check error");
    this._equal(orderData.bidder, buyer, "current bidder is you");
    this._equal(orderData.owner, buyer, "cannot bid yourself asset");
    this._notIn(per, [1,2], "bidding percentage error");
    if (orderData.expire !== null) {
      this._gte(tx.time, orderData.expire, "Order is expired");
    }
    const minprice = this._multi(orderData.price, this._getPcen(per), fixed);
    this._lteF(minprice, orderData.price, "Price check error");
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

    const memo = 'AUC-CLAIM-' + orderData.contract + "-" +  orderData.tokenId;
    const marketFee = this._multi(orderData.price, feeRate, fixFee);
    this._lteF(marketFee, "0", "marketFee amount error");
    this._safeTransfer(blockchain.contractName(), ZUNAFEE, marketFee, orderData.symbol, memo);
    let cpFee = 0;
    // NOTE: nft creator is not implemented yet
    // const nft = this._getNFTInfo(contract, orderData.tokenId);
    // let cpFee = 0;
    // cpFee = this._multi(orderData.price, cpRate, fixFee);
    // this._lteF(cpFee, "0", "cpFee amount error");
    //const memo1 = 'AUC-CPFEE-'+ orderData.contract + "-" +  orderData.tokenId;
    //this._safeTransfer(blockchain.contractName(), nft.creator, cpFee, orderData.symbol, memo1);

    const fee = this._plus(marketFee, cpFee, fixFee);
    this._gteF(fee, orderData.price, "Owner amount error");
    const ownerFee = this._minus(orderData.price, fee, fixFee);
    const nftMemo = 'AUC-TO-OWNER-' + orderData.contract + "-" +  orderData.tokenId;
    this._safeTransfer(blockchain.contractName(), orderData.owner, ownerFee,
      orderData.symbol, nftMemo);

    const nftArgs = [
        orderData.tokenId,
        blockchain.contractName(),
        orderData.bidder,
        "1",
        memo
    ];
    blockchain.callWithAuth(orderData.contract, 'transfer', JSON.stringify(nftArgs));

    const unfreezeTime = tx.time + lockTime*1e9
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

  }

  loadNFTContract(contract){
    this._requireOwner();
    if (this._globalHas(contract, NFT_CONTRACT_KEY) == false){
      throw "NFT ContractID doest not exist!";
    }
    this._put(NFT_CONTRACT_ID, contract, tx.publisher);
  }

  rmOrder(orderId) {
     this._requireAuth();
     this._unsale(orderId);
     return this._msg(200 , "success");
  }

  rmStorage(key){
    this._requireOwner();
    this._remove(key);
  }

}
module.exports = ZunaNFTBid;
