const BASE = new Int64(32);
const ALPHA = '123456789abcdefghijkmnopqrstuvwx';
const KAI_MAPPING = {
   '1':0,  '2':1,  '3':2,  '4':3,  '5':4,  '6':5,  '7':6,  '8':7,
   '9':8,  'a':9,  'b':10, 'c':11, 'd':12, 'e':13, 'f':14, 'g':15,
   'h':16, 'i':17, 'j':18, 'k':19, 'm':20, 'n':21, 'o':22, 'p':23,
   'q':24, 'r':25, 's':26, 't':27, 'u':28, 'v':29, 'w':30, 'x':31
}

class GeneScience {

  init() {

  }

  _getBlockTime(div=1000) {
    div = +div;
    return block.time / div;
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

  _put(k, v, stringify, p) {
    if (p === undefined) {
        p = tx.publisher;
    }
    if (stringify === false) {
      storage.put(k, v, p);
    } else {
      storage.put(k, JSON.stringify(v), p);
    }
  }

  hexToBn(hex) {
    if (hex.length % 2) {
      hex = '0' + hex;
    }

    let highbyte = parseInt(hex.slice(0, 2), 16)
    let bn = new Int64('0x' + hex);

    if (0x80 & highbyte) {
      bn = new Int64('0b' + bn.toString(2).split('').map(function (i) {
        return '0' === i ? 1 : 0
      }).join('')) + new Int64(1);
      bn = -bn;
    }
    return bn;
  }

  encode(num) {
    let buf = '';
    while (num >= BASE){
      let mod = num % BASE;
      buf = ALPHA[mod] + buf
      num = ((num - mod) / BASE) >> new Int64(0);
    }
    return ALPHA[num] + buf
  }

  decode(gene) {
    let result = new Int64(0);
    for (let i = 0; i < gene.length; i++) {
      result = result * BASE + new Int64(KAI_MAPPING[gene[i]])
    }
    return result;
  }

  _getNow() {
    return Math.floor(block.time / 1e9)
  }

  _format(code) {
    return code.split('').map((d, i) => (i) % 4 == 0 ? ' ' + d : d).join('').trim();
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active") && !this.isLocked();
  }

  _requireContractOwner() {
    if(!blockchain.requireAuth(blockchain.contractOwner(), 'active')){
      throw 'permission denied';
    }
  }

  isLocked() {
    const now = this._getNow();
    const status = +this._get("timeLockStatus", 0);
    const until = +this._get("timeLockUntil", 0);
    return status == 1 || now < until;
  }

  setGeneMultiplier(multiplier) {
    this._requireOwner();
    multiplier = +multiplier;
    this._put('multiplier', multiplier)
  }

  _getMultiplier() {
    return this._get('multiplier', 1);
  }

  calculatePower(gene, ability) {
    const multiplier = this._getMultiplier();
    ability = ability.split('-');
    let geneSum = 0;
    for (let i = 0; i < gene.length; i++) {
      if(KAI_MAPPING[gene[i]] !== undefined) {
        geneSum += (KAI_MAPPING[gene[i]] + 1);
      }
    }

    let abSum = 0;
    for (let i = 0; i < ability.length; i++) {
      let ab = +ability[i];
      if (ab !== NaN) {
        abSum += ab;  
      }
    }
    return (geneSum * multiplier) + abSum;
  }

  mixAbilities(ability1, ability2, fuse) {
    ability1 = ability1.split('-');
    ability2 = ability2.split('-');

    if ( ability1.length !== ability2.length ) {
      throw "Ability mismatch."
    }
    let limit = ability1.length > ability2.length ? ability1.length : ability2.length;
    let seed = this._getBlockTime();

    function _random(mod=100) {
      seed ^= seed << 13; 
      seed ^= seed >> 17;
      seed ^= seed << 5;
      var res = (seed <0) ? ~seed+1 : seed;
      return res % mod;
    }

    var res = [];
    if ( fuse === false ) {
      for ( let i = 0;i < limit; i++ ) {
        let ab1 = +ability1[i];
        let ab2 = +ability2[i];

        let avg = Math.floor(((ab1 + ab2) / 2));
        let diff = Math.ceil((avg * 1.1) - avg);
        res.push((avg + _random(diff)).toString())
      }
      return res.join("-");

    } else {
      for ( let i = 0;i < limit; i++ ) {
        let ab1 = +ability1[i];
        let ab2 = +ability2[i];

        let gt = ab1 > ab2 ? ab1 : ab2;
        let lt = ab1 < ab2 ? ab1 : ab2;
        let multiplier = [1,1,1,1,1,1.5,1.5,1.5,1.75,2];
        let attr = gt + _random(lt);
        attr = Math.ceil(multiplier[_random(multiplier.length)] * attr);
        res.push(attr.toString());
      }
      return res.join("-");
    }
  }

  mixGenes(mgenes, sgenes, fuse) {
    if (mgenes.length != sgenes.length) {
      throw "Gene length mismatch."
    }

    mgenes = mgenes.split("").reverse();
    sgenes = sgenes.split("").reverse();

    let babygenes = "?".repeat(48).split("");
    let seed = this._getBlockTime();

    function _random(mod=100) {
      seed ^= seed << 13; 
      seed ^= seed >> 17;
      seed ^= seed << 5;
      var res = (seed <0) ? ~seed+1 : seed;
      return res % mod;
    }

    for (let i = 0; i < 12; i++) {
      let index = 4 * i
      for (let j = 3; j > 0; j--) {
        if (_random() < 25) {
          let temp1 = mgenes[index+j];
          let temp2 = mgenes[index+j-1];
          mgenes[index+j-1] = temp1;
          mgenes[index+j] = temp2;
        }
            
        if (_random() < 25) {
          let temp1 = sgenes[index+j];
          let temp2 = sgenes[index+j-1];
          sgenes[index+j-1] = temp1;
          sgenes[index+j] = temp2;
        }         
      }
    }

    for (let i = 0; i < 48; i++) {
      let mutation = 0;
      let probability = 0;
      if (i % 4 == 0) {
        let gene1 = KAI_MAPPING[mgenes[i]];
        let gene2 = KAI_MAPPING[sgenes[i]];

        if (gene1 > gene2) {
          let temp = gene1;
          gene1 = gene2;
          gene2 = temp;
        }

        if (gene1 % 2 == 0) {
          probability = 80;
        } else {
          probability = 10;
        }

        if (probability) {
          if ((_random()) < probability) {
            let idx = gene1+_random(3)+1;
            if (idx+1 <= ALPHA.length){
              mutation = ALPHA[idx];
            }
          }
        }
      }

      if (mutation) {
        babygenes[i] = mutation;
      } else {
        if (KAI_MAPPING[mgenes[i]] > KAI_MAPPING[sgenes[i]]) {
          if(_random() > 79){
            babygenes[i] = sgenes[i]
          } else {
            babygenes[i] = mgenes[i]
          }
        } else {
          if(_random() > 19){
            babygenes[i] = sgenes[i]
          } else {
            babygenes[i] = mgenes[i]
          }
        }
      }
    }
    return babygenes.reverse().join("");
  }

  version(){
    return '0.0.1'
  }

}

module.exports = GeneScience;