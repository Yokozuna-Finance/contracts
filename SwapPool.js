const ROUND_DOWN = 1;
const TIME_LOCK_DURATION = 3600 * 12; 
const COMPLEMENT_PERCENTAGE = 997 // value mius 0.3% service fee
const GROSS_PERCENTAGE = 1000

const CHUNK_SIZE = 500;
const UNIVERSAL_PRECISION = 8;
const MINIMUM_LIQUIDITY = 0.00001;
const UNIT_LIQUIDITY = 0.00000001;

class SwapPool {

  init() {
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active") && !this.isContractLocked();
  }

  _requireContractOwner() {
    if(!blockchain.requireAuth(blockchain.contractOwner(), 'active')){
      throw 'permission denied';
    }
  }

  _requireContractUnlocked() {
    if (this.isContractLocked()) {
      throw "contract is locked";
    }
  }

  _getPairName(token0, token1) {
    if(token0 == 'iost'){
      return token1  + "/" + token0
    }else if(token1 == 'iost'){
      return token0 + "/" + token1;
    }else if (token0 < token1) {
      return token0 + "/" + token1;
    } else {
      return token1 + "/" + token0;
    }
  }

  _getPair(pairName) {
    var pair = storage.mapGet("pair", pairName) || "null";
    return JSON.parse(pair);
  }

  _hasPair(pairName) {
    return storage.mapHas("pair", pairName);
  }

  _getTokenName(){
    return storage.get('token') || ''
  }

  setTokenName(token){
    this._requireContractOwner();
    storage.put("token", token.toString());
  }

  _setPair(pairName, pair) {
    storage.mapPut("pair", pairName, JSON.stringify(pair));
  }

  buildPair(token0, token1){
    var pair = {}
    const pairName = token0 + "/" + token1;
    pair.token0 = token0;
    pair.token1 = token1;
    this._setPair(pairName, pair);
  }

  _setPairObj(pair) {
    const pairName = pair.token0 + "/" + pair.token1;
    this._setPair(pairName, pair);
  }

  getPair(token0, token1) {
    const pairName = this._getPairName(token0, token1);
    return this._getPair(pairName);
  }

  _plusTokenBalance(token, delta, precision) {
    var balance = new BigNumber(storage.mapGet("tokenBalance", token) || "0");
    balance = balance.plus(delta);
    storage.mapPut("tokenBalance", token, balance.toFixed(precision, ROUND_DOWN));
  }

  _minusTokenBalance(token, delta, precision) {
    var balance = new BigNumber(storage.mapGet("tokenBalance", token) || "0");
    balance = balance.minus(delta);
    storage.mapPut("tokenBalance", token, balance.toFixed(precision, ROUND_DOWN));
  }

  _update(pair, balance0, balance1) {
    const now = Math.floor(block.time / 1e9);

    if (now < pair.blockTimestampLast) {
      throw "block time error";
    }

    const timeElapsed = now - pair.blockTimestampLast;

    if (timeElapsed > 0 && pair.reserve0 > 0 && pair.reserve1 > 0) {
      pair.price0CumulativeLast =
          new BigNumber(pair.price0CumulativeLast).plus(
              new BigNumber(pair.reserve1).div(
                  pair.reserve0).times(timeElapsed)).toFixed(UNIVERSAL_PRECISION, ROUND_DOWN);
      pair.price1CumulativeLast =
          new BigNumber(pair.price1CumulativeLast).plus(
              new BigNumber(pair.reserve0).div(
                  pair.reserve1).times(timeElapsed)).toFixed(UNIVERSAL_PRECISION, ROUND_DOWN);
    }

    pair.reserve0 = balance0.toFixed(pair.precision0, ROUND_DOWN);
    pair.reserve1 = balance1.toFixed(pair.precision1, ROUND_DOWN);
    pair.blockTimestampLast = now;

    blockchain.receipt(JSON.stringify(["sync", pair.reserve0, pair.reserve1]));
  }

  _getSwap() {
    return storage.get("swap") || '';
  }

  setSwap(swap) {
    this._requireContractOwner();
    this._requireContractUnlocked();

    storage.put("swap", swap.toString());
  }

  _getFeeTo() {
    return storage.get("feeTo") || '';
  }

  setFeeTo(feeTo) {
    this._requireContractOwner();

    storage.put("feeTo", feeTo);
  }

  _getListingFee() {
    return storage.get("listingFee");
  }

  setListingFee(fee) {
    this._requireContractOwner();

    storage.put("listingFee", fee.toString());
  }

  _insertToAllPairs(pairName) {
    let index = 0;
    while (storage.mapHas("allPairs", index.toString())) {
      ++index;
    }

    if (index - 1 >= 0) {
      const array = JSON.parse(storage.mapGet("allPairs", (index - 1).toString()));
      if (array.length < CHUNK_SIZE) {
        array.push(pairName);
        storage.mapPut("allPairs", (index - 1).toString(), JSON.stringify(array));
        return;
      }
    }

    storage.mapPut("allPairs", index.toString(), JSON.stringify([pairName]));
  }

  _checkPrecision(symbol) {
    return +storage.globalMapGet("token.iost", "TI" + symbol, "decimal") || 0;
  }

  _calculatePrice(amount, reserve0, reserve1) {
    amount = new BigNumber(amount);
    reserve0 = new BigNumber(reserve0);
    reserve1 = new BigNumber(reserve1);

    if (amount.lt(0) || reserve0.lte(0) || reserve1.lt(0)) {
      throw "invalid input";
    }

    return amount.times(reserve1).div(reserve0);
  }

  _addLiquidity(token0, token1, amount0Desired, amount1Desired, amount0Min, amount1Min) {
    const pair = this.getPair(token0, token1);

    if (!pair) {
      throw "pair not found";
    }

    let reserve0;
    let reserve1; 
    if (token0 == pair.token0) {
      reserve0 = new BigNumber(pair.reserve0);
      reserve1 = new BigNumber(pair.reserve1);
    } else {
      reserve0 = new BigNumber(pair.reserve1);
      reserve1 = new BigNumber(pair.reserve0);
    }

    if (reserve0.eq(0) || reserve1.eq(0)) {
      return [amount0Desired, amount1Desired];
    } else {
      const amountBOptimal = this._calculatePrice(amount0Desired, reserve0, reserve1);
      if (amountBOptimal.lte(amount1Desired)) {
        if (amountBOptimal.lt(amount1Min)) {
          throw "insufficient b amount";
        }

        return [amount0Desired, amountBOptimal];
      } else {
        const amountAOptimal = this._calculatePrice(amount1Desired, reserve1, reserve0);

        if (amountAOptimal.gt(amount0Desired)) {
          throw "internal error";
        }

        if (amountAOptimal.lt(amount0Min)) {
          throw "insufficient a amount";
        }

        return [amountAOptimal, amount1Desired];
      }
    }
  }

  _swapToken(tokenA, tokenB, amountAIn, amountBIn, amountAOut, amountBOut, srcAddress, dstAddress) {
    const pair = this.getPair(tokenA, tokenB);

    if (!pair) {
      throw "no pair";
    }

    const amount0In = new BigNumber(pair.token0 == tokenA ? amountAIn : amountBIn);
    const amount1In = new BigNumber(pair.token1 == tokenB ? amountBIn : amountAIn);
    const amount0Out = new BigNumber(pair.token0 == tokenA ? amountAOut : amountBOut);
    const amount1Out = new BigNumber(pair.token1 == tokenB ? amountBOut : amountAOut);

    if (amount0In.lt(0) || amount1In.lt(0) || amount0Out.lt(0) || amount1Out.lt(0)) {
      throw "invalid input";
    }

    if (amount0Out.eq(0) && amount1Out.eq(0)) {
      throw "insufficient output amount";
    }

    if (amount0In.eq(0) && amount1In.eq(0)) {
      throw "insufficient input amount";
    }

    if (amount0Out.gte(pair.reserve0) || amount1Out.gte(pair.reserve1)) {
      throw "insufficient liquidity";
    }

    if (amount0In.gt(0) && srcAddress != blockchain.contractName()) {
      // optimistically transfer tokens
      blockchain.callWithAuth("token.iost", "transfer",
          [pair.token0,
           srcAddress,
           blockchain.contractName(),
           amount0In.toFixed(pair.precision0, ROUND_DOWN),
           "swap in"]);
      this._plusTokenBalance(pair.token0, amount0In, pair.precision0);
    }

    if (amount1In.gt(0) && srcAddress != blockchain.contractName()) {
      // optimistically transfer tokens
      blockchain.callWithAuth("token.iost", "transfer",
          [pair.token1,
           srcAddress,
           blockchain.contractName(),
           amount1In.toFixed(pair.precision1, ROUND_DOWN),
           "swap in"]);
      this._plusTokenBalance(pair.token1, amount1In, pair.precision1);
    }

    if (amount0Out.gt(0) && dstAddress != blockchain.contractName()) {
      // optimistically transfer tokens
      blockchain.callWithAuth("token.iost", "transfer",
          [pair.token0,
           blockchain.contractName(),
           dstAddress,
           amount0Out.toFixed(pair.precision0, ROUND_DOWN),
           "swap out"]);
      this._minusTokenBalance(pair.token0, amount0Out, pair.precision0);
    }

    if (amount1Out.gt(0) && dstAddress != blockchain.contractName()) {
      // optimistically transfer tokens
      blockchain.callWithAuth("token.iost", "transfer",
          [pair.token1,
           blockchain.contractName(),
           dstAddress,
           amount1Out.toFixed(pair.precision1, ROUND_DOWN),
           "swap out"]);
      this._minusTokenBalance(pair.token1, amount1Out, pair.precision1);
    }

    const balance0 = new BigNumber(pair.reserve0).plus(amount0In).minus(amount0Out);
    const balance1 = new BigNumber(pair.reserve1).plus(amount1In).minus(amount1Out);

    const balance0Adjusted = balance0.times(1000).minus(amount0In.times(3));
    const balance1Adjusted = balance1.times(1000).minus(amount1In.times(3));

    if (balance0Adjusted.times(balance1Adjusted).lt(new BigNumber(pair.reserve0).times(pair.reserve1).times(1000000))) {
      throw "K" + balance0Adjusted + ", " + balance1Adjusted + ", " + pair.reserve0 + ", " + pair.reserve1;
    }

    this._update(pair, balance0, balance1);
    this._setPairObj(pair);
  }

  _swap(amounts, route, toAddress) {
    route = JSON.parse(route);
    for (let i = 0; i < route.length - 1; i++) {
      const sourceAdd = i == 0 ? JSON.parse(blockchain.contextInfo()).caller.name : this._getSwap();
      const destAdd = i == route.length - 2 ? toAddress : this._getSwap();
      this._swapToken(
        route[i],
        route[i + 1],
        amounts[i].toString(), 
        "0", 
        "0",
        amounts[i + 1].toString(), 
        sourceAdd, 
        destAdd
      );
    }
  }

  _calculateOutputAmount(amountIn, reserveIn, reserveOut, precision) {
    amountIn = new BigNumber(amountIn);
    reserveIn = new BigNumber(reserveIn);
    reserveOut = new BigNumber(reserveOut);

    if (amountIn.lte(0)) {
      throw 'insufficient input amount';
    }

    if (reserveIn.lte(0) || reserveOut.lte(0)) {
      throw 'insufficient asset';
    }

    precision = precision * 1 || 0;
    if (precision < 0) {
      throw 'invalid precision';
    }

    const amountInWithFee = amountIn.times(COMPLEMENT_PERCENTAGE);
    const numerator = amountInWithFee.times(reserveOut);
    const denominator = reserveIn.times(GROSS_PERCENTAGE).plus(amountInWithFee);
    return numerator.div(denominator).toFixed(precision, ROUND_DOWN);
  }

  _calculateInputAmount(amountOut, reserveIn, reserveOut, precision) {
    amountOut = new BigNumber(amountOut);
    reserveIn = new BigNumber(reserveIn);
    reserveOut = new BigNumber(reserveOut);

    if (amountOut.lte(0)) {
      throw 'insufficient output amount';
    }

    if (reserveIn.lte(0) || reserveOut.lt(amountOut)) {
      throw 'insufficient asset';
    }

    precision = precision * 1 || 0;
    if (precision < 0) {
      throw 'invalid precision';
    }

    const numerator = reserveIn.times(amountOut).times(GROSS_PERCENTAGE);
    const denominator = reserveOut.minus(amountOut).times(COMPLEMENT_PERCENTAGE);
    return numerator.div(denominator).plus(1 / 10 ** precision).toFixed(precision, ROUND_DOWN);
  }

  isContractLocked() {
    const now = Math.floor(block.time / 1e9);
    const timeLockstatus = +storage.get("timeLockStatus") || 0;
    const timeLockuntil = +storage.get("timeLockUntil") || 0;
    return timeLockstatus == 1 || now < timeLockuntil;
  }

  startLock() {
    this._requireContractOwner();

    storage.put("timeLockStatus", "1");
  }

  stopLock() {
    this._requireContractOwner();
    const now = Math.floor(block.time / 1e9);

    storage.put("timeLockUntil", (now + TIME_LOCK_DURATION).toString());
    storage.put("timeLockStatus", "0")
  }

  _mintFee(pair) {
    const feeTo = this._getFeeTo();
    const feeOn = feeTo != '';

    const _lastConstantProduct = new BigNumber(pair.lastConstantProduct); // gas savings

    if (feeOn) {
      if (!_lastConstantProduct.eq(0)) {
        const rootK = (new BigNumber(pair.reserve0).times(pair.reserve1)).sqrt();
        const rootKLast = _lastConstantProduct.sqrt();

        if (rootK.gt(rootKLast)) {
          const totalSupply = new BigNumber(blockchain.call("token.iost", "supply", [pair.lp])[0]);
          const numerator = rootK.minus(rootKLast).times(totalSupply);
          const denominator = rootK.times(5).plus(rootKLast);
          const liquidity = numerator.div(denominator);
          const liquidityStr = liquidity.toFixed(UNIVERSAL_PRECISION, ROUND_DOWN);
          if (new BigNumber(liquidityStr).gt(0)) {
            this._mintToken(pair.lp, feeTo, liquidity);
          }
        }
      }
    } else if (!_lastConstantProduct.eq(0)) {
      pair.lastConstantProduct = "0";
    }

    return feeOn;
  }

  _mintToken(lpSymbol, toAddress, amount) {
    blockchain.callWithAuth("token.iost", "issue",
        [lpSymbol, toAddress, amount.toFixed(UNIVERSAL_PRECISION, ROUND_DOWN)]);
  }

  _mint(tokenA, tokenB, amountA, amountB, fromAddress, toAddress) {
    const pair = this.getPair(tokenA, tokenB);

    if (!pair) {
      throw "no pair";
    }

    const amount0 = new BigNumber(pair.token0 == tokenA ? amountA : amountB);
    const amount1 = new BigNumber(pair.token1 == tokenB ? amountB : amountA);

    if (amount0.lte(0) || amount1.lte(0)) {
      throw "invalid input";
    }

    blockchain.callWithAuth("token.iost", "transfer",
        [pair.token0,
         fromAddress,
         blockchain.contractName(),
         amount0.toFixed(pair.precision0, ROUND_DOWN),
         "mint liquidity provider"]);
    this._plusTokenBalance(pair.token0, amount0, pair.precision0);
    blockchain.callWithAuth("token.iost", "transfer",
        [pair.token1,
         fromAddress,
         blockchain.contractName(),
         amount1.toFixed(pair.precision1, ROUND_DOWN),
         "mint liquidity provider"]);
    this._plusTokenBalance(pair.token1, amount1, pair.precision1);
    const feeOn = this._mintFee(pair);
    const _totalSupply = new BigNumber(blockchain.call("token.iost", "supply", [pair.lp])[0]);
    let liquidity;

    if (_totalSupply.eq(0)) {
      liquidity = amount0.times(amount1).sqrt().minus(MINIMUM_LIQUIDITY);
      this._mintToken(pair.lp, blockchain.contractName(), MINIMUM_LIQUIDITY);
    } else {
      liquidity = BigNumber.min(amount0.times(_totalSupply).div(pair.reserve0),
          amount1.times(_totalSupply).div(pair.reserve1));
    }
    const balance0 = amount0.plus(pair.reserve0);
    const balance1 = amount1.plus(pair.reserve1);

    if (liquidity.lt(UNIT_LIQUIDITY)) {
      throw 'insufficient liquidity minted';
    }

    this._mintToken(pair.lp, toAddress, liquidity);

    this._update(pair, balance0, balance1);

    if (feeOn) {
      pair.lastConstantProduct = new BigNumber(pair.reserve0).times(pair.reserve1).toFixed(
          pair.precision0 + pair.precision1, ROUND_DOWN);
    }

    pair.lpSupply = blockchain.call("token.iost", "supply", [pair.lp])[0];
    this._setPairObj(pair);

    return liquidity;
  }

  _burnToken(lpSymbol, fromAddress, amount) {
    blockchain.callWithAuth("token.iost", "destroy",
        [lpSymbol, fromAddress, amount.toFixed(UNIVERSAL_PRECISION, ROUND_DOWN)]);
  }

  _burn(tokenA, tokenB, liquidity, fromAddress, toAddress) {
    liquidity = new BigNumber(liquidity);

    if (liquidity.lt(UNIT_LIQUIDITY)) {
      throw "invalid input";
    }

    const pair = this.getPair(tokenA, tokenB);

    if (!pair) {
      throw "no pair";
    }

    const feeOn = this._mintFee(pair);
    const _totalSupply = blockchain.call("token.iost", "supply", [pair.lp])[0];

    const amount0 = liquidity.times(pair.reserve0).div(_totalSupply);
    const amount1 = liquidity.times(pair.reserve1).div(_totalSupply);

    if (amount0.lte(0) || amount1.lte(0)) {
      throw 'insufficient liquidity burned';
    }

    this._burnToken(pair.lp, fromAddress, liquidity);

    blockchain.callWithAuth("token.iost", "transfer",
        [pair.token0,
         blockchain.contractName(),
         toAddress,
         amount0.toFixed(pair.precision0, ROUND_DOWN),
         "burn liquidity provider"]);
    this._minusTokenBalance(pair.token0, amount0, pair.precision0);

    blockchain.callWithAuth("token.iost", "transfer",
        [pair.token1,
         blockchain.contractName(),
         toAddress,
         amount1.toFixed(pair.precision1, ROUND_DOWN),
         "burn liquidity provider"]);
    this._minusTokenBalance(pair.token1, amount1, pair.precision1);

    const balance0 = new BigNumber(pair.reserve0).minus(amount0);
    const balance1 = new BigNumber(pair.reserve1).minus(amount1);

    this._update(pair, balance0, balance1);

    if (feeOn) {
      pair.lastConstantProduct = new BigNumber(pair.reserve0).times(pair.reserve1).toFixed(
          pair.precision0 + pair.precision1, ROUND_DOWN); // reserve0 and reserve1 are up-to-date
    }

    pair.lpSupply = blockchain.call("token.iost", "supply", [pair.lp])[0];
    this._setPairObj(pair);

    if (tokenA == pair.token0) {
      return [amount0.toFixed(pair.precision0, ROUND_DOWN), amount1.toFixed(pair.precision1, ROUND_DOWN)];
    } else {
      return [amount1.toFixed(pair.precision1, ROUND_DOWN), amount0.toFixed(pair.precision0, ROUND_DOWN)];
    }
  }

  addLiquidity(token0, token1, amount0Desired, amount1Desired, amount0Min, amount1Min, toAddress) {
    const pair = this.getPair(token0, token1);
    if (!pair) {
      throw "pair not found";
    }

    const precisionA = token0 == pair.token0 ? pair.precision0 : pair.precision1;
    const precisionB = token0 == pair.token0 ? pair.precision1 : pair.precision0;

    amount0Desired = new BigNumber(new BigNumber(amount0Desired).toFixed(precisionA, ROUND_DOWN));
    amount1Desired = new BigNumber(new BigNumber(amount1Desired).toFixed(precisionB, ROUND_DOWN));
    amount0Min = new BigNumber(new BigNumber(amount0Min).toFixed(precisionA, ROUND_DOWN));
    amount1Min = new BigNumber(new BigNumber(amount1Min).toFixed(precisionB, ROUND_DOWN));


    if (amount0Desired.lte(0) || amount1Desired.lte(0) || amount0Min.lte(0) || amount1Min.lte(0)) {
      throw "invalid input";
    }

    const amountArray = this._addLiquidity(
      token0,
      token1, 
      amount0Desired,
      amount1Desired,
      amount0Min, 
      amount1Min
    );

    const amountA = amountArray[0];
    const amountB = amountArray[1];
    const asset = this._mint(
      token0, 
      token1, 
      amountA.toFixed(precisionA, ROUND_DOWN), 
      amountB.toFixed(precisionB, ROUND_DOWN),
      JSON.parse(blockchain.contextInfo()).caller.name, 
      toAddress
    );

    return [
      amountA.toFixed(precisionA, ROUND_DOWN), 
      amountB.toFixed(precisionB, ROUND_DOWN), 
      asset
    ];
  }

  checkRoute(route) {
    route = JSON.parse(route);

    if (route.length < 2) {
      return 0;
    }

    for (let i = 0; i < route.length - 1; i++) {
      const pair = this.getPair(route[i], route[i + 1]);

      if (!pair) {
        return 0;
      }
    }

    return 1;
  }

  createPair(token0, token1) {
    const tokenName = this._getTokenName();

    if(!tokenName){
      throw "token not set."
    }

    if(token0 == token1){
      throw "cannot add pair of the same token."
    }

    if (token0 == 'iost') {
      let temp = token0;
      token0 = token1;
      token1 = temp;
    } else if(token1 != 'iost' && token0 > token1){
      let temp = token0;
      token0 = token1;
      token1 = temp;
    }

    const pairName = this._getPairName(token0, token1);
    if (this._hasPair(pairName)) {
      throw "pair exists";
    }

    const totalSupply0 = +blockchain.call("token.iost", "totalSupply", [token0])[0];
    const totalSupply1 = +blockchain.call("token.iost", "totalSupply", [token1])[0];
    if (!totalSupply0 || !totalSupply1) {
      throw "invalid token";
    }

    const now = Math.floor(block.time / 1e9);
    if (this._getFeeTo()) {
      if(!this._getListingFee()){
        throw "listing fee not set."
      }
      blockchain.callWithAuth("token.iost", "transfer",
          [tokenName,
           JSON.parse(blockchain.contextInfo()).caller.name,
           this._getFeeTo(),
           this._getListingFee(),
           "listing fee"]);
    }

    // token symbol length should be bet 2,16
    const lpSymbol = "lp" + this._getTokenName().substring(0, 4) + "_" + token0.substring(0, 4) + "_" + token1.substring(0,4);
    let data = {
      createdTime: now,
      token0: token0,
      token1: token1,
      precision0: this._checkPrecision(token0),
      precision1: this._checkPrecision(token1),
      reserve0: "0",
      reserve1: "0",
      blockTimestampLast: 0,
      price0CumulativeLast: "0",
      price1CumulativeLast: "0",
      lastConstantProduct: "0",
      lp: lpSymbol,
      lpSupply: "0"
    }

    storage.mapPut("pair", pairName, JSON.stringify(data));

    this._insertToAllPairs(pairName);

    let providerData = [];
    storage.mapPut(lpSymbol.toString(), 'data', JSON.stringify(providerData));

    
    const config = {
      "decimal": UNIVERSAL_PRECISION,
      "canTransfer": true,
      "fullName": "Yokozuna LP Token: " + token0 + " / " + token1
    };

    blockchain.callWithAuth("token.iost", "create",
        [lpSymbol, blockchain.contractName(), 10000000000, config]);
  }

  createPairAndAddLiquidity(token0, token1, amount0Desired, amount1Desired, toAddress) {
    this.createPair(token0, token1, JSON.parse(blockchain.contextInfo()).caller.name);

    if (new BigNumber(amount0Desired).gt(0) && new BigNumber(amount1Desired).gt(0)) {
      return this.addLiquidity(
        token0, 
        token1, 
        amount0Desired, 
        amount1Desired, 
        amount0Desired, 
        amount1Desired, 
        toAddress
      );
    } else {
      return [0, 0, 0];
    }
  }

  removeAsset(token0, token1, asset, amount0Min, amount1Min, toAddress) {
    const pair = this.getPair(token0, token1);
    
    if (!pair) {
      throw "pair not found";
    }

    const precisionA = token0 == pair.token0 ? pair.precision0 : pair.precision1;
    const precisionB = token0 == pair.token0 ? pair.precision1 : pair.precision0;

    asset = new BigNumber(asset);
    amount0Min = new BigNumber(amount0Min);
    amount1Min = new BigNumber(amount1Min);

    if (asset.lte(0) || amount0Min.lte(0) || amount1Min.lte(0)) {
      throw "invalid input";
    }

    const amountArray = this._burn(
      token0, 
      token1, 
      asset.toString(), 
      JSON.parse(blockchain.contextInfo()).caller.name,
      toAddress
    );
    const amountA = new BigNumber(amountArray[0]);
    const amountB = new BigNumber(amountArray[1]);

    if (amountA.lt(amount0Min)) {
      throw "insufficient a amount";
    }

    if (amountB.lt(amount1Min)) {
      throw "insufficient b amount";
    }

    return [amountA.toFixed(precisionA, ROUND_DOWN), amountB.toFixed(precisionB, ROUND_DOWN)];
  }

  swapExactInputToken(amountIn, amountOutMin, route, toAddress) {
    const amounts = this.getOutputAmounts(amountIn, route);

    if (new BigNumber(amounts[amounts.length - 1]).lt(amountOutMin)) {
      throw 'insufficient output amount';
    }

    this._swap(amounts, route, toAddress);
    return amounts;
  }

  swapExactOutputToken(amountOut, amountInMax, route, toAddress) {
    const amounts = this.getInputAmounts(amountOut, route);

    if (new BigNumber(amounts[0]).gt(amountInMax)) {
      throw 'excess input amount ' + amounts[0] + ',' + amountInMax;
    }

    this._swap(amounts, route, toAddress);
    return amounts;
  }

  getOutputAmounts(amountIn, route) {
    route = JSON.parse(route);

    if (route.length < 2) {
      throw 'invalid route';
    }

    const amounts = [amountIn];
    for (let i = 0; i < route.length - 1; i++) {
      const pair = this.getPair(route[i], route[i + 1]);

      if (!pair) {
        throw "pair not found";
      }

      if (pair.token0 == route[i]) {
        amounts.push(this._calculateOutputAmount(amounts[i], pair.reserve0, pair.reserve1, pair.precision1));
      } else {
        amounts.push(this._calculateOutputAmount(amounts[i], pair.reserve1, pair.reserve0, pair.precision0));
      }
    }

    return amounts;
  }

  getInputAmounts(amountOut, route) {
    route = JSON.parse(route);

    if (route.length < 2) {
      throw 'invalid route';
    }

    const amounts = [amountOut];
    for (let i = route.length - 1; i > 0; i--) {
      const pair = this.getPair(route[i - 1], route[i]);

      if (!pair) {
        throw "pair not found";
      }

      if (pair.token0 == route[i - 1]) {
        amounts.push(this._calculateInputAmount(amounts[route.length - 1 - i], pair.reserve0, pair.reserve1, pair.precision0));
      } else {
        amounts.push(this._calculateInputAmount(amounts[route.length - 1 - i], pair.reserve1, pair.reserve0, pair.precision1));
      }
    }

    amounts.reverse();

    return amounts;
  }

  version(){
    return '0.0.1'
  }
}

module.exports = SwapPool;
