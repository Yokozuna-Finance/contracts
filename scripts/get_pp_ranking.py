import argparse
import csv
import datetime
import json
import requests
from operator import itemgetter
import sqlite3

from decouple import config
from base58 import b58decode
from pyost.iost import IOST
from pyost.account import Account
from pyost.algorithm import Ed25519
from pyost.signature import KeyPair

ENV = 'prod'

parser = argparse.ArgumentParser(
    prog = 'get_pp_ranking.py',
    description = '',
)

class GetPushPowerRanking:
    def __init__(self):
        self.connection = sqlite3.connect("deadnft.db")
        self.cursor = self.connection.cursor()
        self.has_config = False
        self._setup_account()
        self._setup_server();
        self.staked_nfts = {}
        
    def _setup_server(self):
        self.iost = IOST(
            config('SERVER'),
            chain_id=int(config('CHAIN_ID')),
            gas_limit=int(config('GAS_LIMIT'))
        )
        self.iost.publisher = self.acc

    def _setup_account(self):
        private_key = config('PRIVATE_KEY')
        account_name = config('ACCOUNT')
        acc_seckey = b58decode(private_key.encode('utf-8'))
        acc_kp = KeyPair(Ed25519, acc_seckey)

        self.acc = Account(account_name)
        self.acc.add_key_pair(acc_kp, 'active')
        self.acc.add_key_pair(acc_kp, 'owner')

    def _execute_tx(self, tx):
        #try:
        self.acc.sign_publish(tx)
        receipt = self.iost.send_and_wait_tx(tx)
        #except (TransactionError, TimeoutError) as err:
        #    print(err)
        return receipt

    def _add_dead_nfts(self, deadnfts):
        try:
            self.cursor.executemany("insert into deadnft values (?)", deadnfts)
            self.connection.commit()
        except:
            print(deadnfts)
            pass

    def _get_storage_data(self, contract_id, key, field=''):
        resp = requests.post(
            config('STORAGE_URL'),
            json={
                'id': contract_id,
                'key': key,
                'field': field,
                'by_longest_chain': True
            }
        )
        return json.loads(resp.json()['data'])

    def _get_nft(self, id):
        return self._get_storage_data(config('NFT_CONTRACT_ID'), self._format_nft(id), '')

    def _format_nft(self, id):
        return'znft.%010d' % int(id)

    def _get_config(self):
        result = self.cursor.execute("select * from config where label = ? ", (ENV, ),).fetchone()

        if result:
            self.has_config = True
            return {
                'label': result[0], 
                'start': int(result[1]), 
                'rankings': json.loads(result[2])
            }

        else:
            return {
                'label': ENV, 
                'start': 1, 
                'rankings': []
            }

    def _update_config(self, start, rankings):
        if self.has_config == True:
            self.cursor.execute("update config set start = ?, rankings = ? where label = ?", 
                (str(start), json.dumps(rankings), ENV)
            )
        else:
            self.cursor.execute("insert into config values(?, ?, ?)", 
                (ENV, str(start), json.dumps(rankings))
            )
        self.connection.commit()

    def get_updated_rank(self, config):
        deadaddr_nft = []
        new_rank = []
        print(config)
        for rank in config['rankings']:
            # check if current ranking has been fused already
            nft_info = self._get_nft(rank['id'])

            if nft_info is None:
                continue

            if nft_info['owner'] == 'deadaddr':
                deadaddr_nft.append([nft_info['id'],])
            else:
                new_rank.append(rank)

        if deadaddr_nft:
            self._add_dead_nfts(deadaddr_nft)

        return new_rank


    def _get_staked_user_list(self):
        return self._get_storage_data(config('STAKE_CONTRACT_ID'), 'userBalanceList')


    def _get_staked_nft_list(self, user):
        return self._get_storage_data(config('DAO_CONTRACT_ID'), 'staked.{}'.format(user), '')


    def get_staked_nft(self):
        staked_users = self._get_staked_user_list();

        for user in staked_users:
            self.staked_nfts[user] = self._get_staked_nft_list(user)

    def get_nft_owner(self, nft_id):
        for user in self.staked_nfts.keys():
            if self.staked_nfts[user] and nft_id in self.staked_nfts[user]:
                print(nft_id,':',user)
                return user
        return None

    def get_nfts(self):
        deadaddr_nft = []
        app_config = self._get_config()
        start = app_config['start']
        print(app_config)

        nfts = self.get_updated_rank(app_config);

        #for nft in nfts:
        #    user = self.get_nft_owner(nft['id'])
        #    if user:
        #        nft['owner'] = user

        while True:
            nft_id = '%010d' % start;
            rows = self.cursor.execute('select id from deadnft where id = ?', (nft_id,)).fetchall();
            if not rows:
                try:
                    nft_info = self._get_nft(start)
                    print(nft_info)
                except Exception as err:
                    print(err)
                    print(nfts, start)
                    break

                if nft_info is None:
                    break

                if nft_info['owner'] == 'deadaddr':
                    deadaddr_nft.append([nft_info['id'],])
                else:
                    nfts.append({'id': nft_info['id'], 'pp': int(nft_info['pushPower']), 'owner': nft_info['owner']})

                if nfts:
                    try:
                        nfts = sorted(nfts, key=itemgetter('pp'), reverse=True)
                    except Exception as err:
                        print(nfts)
                        print(err)
                        break
                nfts = nfts[:40]
            start += 1


        if deadaddr_nft:
            self._add_dead_nfts(deadaddr_nft)

        if nfts:
            self._update_config(start, nfts)
            self._save_ranking(nfts)


    def _save_ranking(self, ranking):
        tx = self.iost.create_call_tx(config('NFT_CONTRACT_ID'), 'setNFTRankings', json.dumps(ranking[:20]))
        response = self._execute_tx(tx)


    def get_nft_users(self):
        app_config = self._get_config()

        new_rankings = []
        self.get_staked_nft();

        for rank in app_config['rankings']:
            if rank['owner'] is None or rank['owner'] == config('DAO_CONTRACT_ID'):
                user = self.get_nft_owner(rank['id'])
                rank['owner'] = user
            new_rankings.append(rank)

        print(new_rankings)


    def update_ranking(self, ranking):
        app_config = self._get_config();

        self._update_config(app_config['start'], ranking)


    def get_staked_users(self):
        start = 1
        staked_users = set()
        while True:
            nft_id = '%010d' % start;
            rows = self.cursor.execute('select id from deadnft where id = ?', (nft_id,)).fetchall();
            if not rows:
                try:
                    nft_info = self._get_nft(start)
                    print(nft_info)
                except Exception as err:
                    print(err)
                    print(nfts, start)
                    break

                if nft_info is None:
                    break

                staked_users.add(nft_info['owner'])
            start += 1

        print(list(staked_users))

    def get_user(self, nft_id):
        staked_users = [
        'clink_ge2lh', 
        '4vhik_2791', 
        'iostpty', 
        'metanyx', 
        'cit8laq64rw', 
        'r1hc7_2881', 
        'sq1h5_2455', 
        'yuuyuu911', 
        'clink_4x24r', 
        'pong_tawat2', 
        'cb3000iost', 
        'dear_me95', 
        'clink_x9wak', 
        'chan_80743', 
        'landies', 
        'kotarawiost', 
        '24giLGvX6UhRc82JP5fajQF4adZD3aHNZFmF739vhoyD', 
        'bakeryiost', 
        'citg78bkb5s', 
        'ymsbv_2787', 
        'yuhei', 
        '1thjx_2897', 
        'chan_18247', 
        'hufuck', 
        'clink_cnn1c', 
        'btoyw_2801', 
        'yukiakari3', 
        'cosmonautbe', 
        'jaguar888', 
        'clink_nbtf0', 
        '1jvemrygoau', 
        'shigemurar', 
        'clink_j05wk', 
        'i0st1151', 
        'shehu5083', 
        '_sgj876p0l9', 
        'wynandbucks', 
        '86_mh6xfm4m', 
        'takeshi', 
        'clink_8mfrq', 
        'bunzcoin', 
        'clink_09hzx', 
        'zgs3w4k77hr', 
        'msaiki', 
        'clink_t0ojj',
        'aadouyi', 
        'ms_qlibuqhg', 
        'clink_qvdff', 
        'shotenpa33', 
        'ms_dwtxf1hg', 
        'chan_57488', 
        'zerolife', 
        'clink_yb9kk', 
        'nteruth', 
        'g8qlv_2309', 
        'clink_fbzgf', 
        'golfweekp', 
        'z2yaj_2856', 
        'clink_ad4zq', 
        'dua02_2851', 
        'ryuji', 
        'clink_6qvka', 
        'hooda1985', 
        'ftakao2007', 
        'iostdaleast', 
        'cikara0410', 
        '5hjdp_2831', 
        'fwoav_2680', 
        'nj3so_2933', 
        'chan_30819', 
        'clink_59bi1', 
        'clink_4ziya', 
        'bmierk', 
        'chan_02894', 
        'clink_0eaum', 
        '30.01', 
        'ms_xkinf8ty', 
        'topgun', 
        'h_hbb221', 
        'tomoziost', 
        'anuganu', 
        'kongari', 
        'toolswork', 
        'metanyx1', 
        '55', 
        'ghwig28ngsx', 
        'clink_o2ai2', 
        'yydouyi', 
        'cctviost', 
        'h6hsp44rs3w', 
        'adm1j5h6', 
        'I0st1151', 
        'cit8laq64rw ', 
        '64ce2_2873', 
        'chenlijun', 
        'chan_05834', 
        'clink_d4fvd', 
        'clink_o13v7', 
        'clink_vdmsh', 
        'ivios', 
        'm3ynpq4ixv9', 
        '2exmww4bj38', 
        'hoihoi2', 
        'chan_16744']

        for user in staked_users:
            nfts = self._get_staked_nft_list(user)
            print(user, nfts)
            if nfts and nft_id in nfts:
                print('!!!!', user)
                return user
        

if __name__ ==  "__main__":
    
    print('ENV:', ENV)

    parser.add_argument('-a', '--action',
        help='get the user list or process airdrop distibution',
        default='get_nfts',
        choices=['get_nfts', 'update_ranking']
    )

    args = parser.parse_args()

    pp_rankings = GetPushPowerRanking()
    # 
    if args.action == 'distribute':
    # pp_rankings.get_nft_users()
        rankings = [{'id': '0000046329', 'pp': 34467725, 'owner': 'h6hsp44rs3w'}, 
            {'id': '0000043731', 'pp': 34201444, 'owner': 'h6hsp44rs3w'}, 
            {'id': '0000046273', 'pp': 24160263, 'owner': 'topgun'}, 
            {'id': '0000040502', 'pp': 10732308, 'owner': 'clink_4x24r'}, 
            {'id': '0000043996', 'pp': 8767838, 'owner': 'topgun'}, 
            {'id': '0000037649', 'pp': 4295352, 'owner': 'clink_4x24r'}, 
            {'id': '0000037162', 'pp': 3712080, 'owner': 'clink_4x24r'}, 
            {'id': '0000044133', 'pp': 3665554, 'owner': 'clink_x9wak'}, 
            {'id': '0000041980', 'pp': 2644338, 'owner': 'clink_4x24r'}, 
            {'id': '0000019191', 'pp': 1728159, 'owner': 'clink_xvezy'}, 
            {'id': '0000044549', 'pp': 1337481, 'owner': 'clink_4x24r'}, 
            {'id': '0000042270', 'pp': 1171210, 'owner': 'clink_x9wak'}, 
            {'id': '0000026859', 'pp': 1069072, 'owner': 'chan_16744'}, 
            {'id': '0000044319', 'pp': 1008652, 'owner': 'clink_37yg7'}, 
            {'id': '0000037004', 'pp': 853224, 'owner': 'clink_4x24r'}, 
            {'id': '0000036700', 'pp': 687404, 'owner': 'clink_4x24r'}, 
            {'id': '0000045043', 'pp': 668602, 'owner': 'kotarawiost'}, 
            {'id': '0000040032', 'pp': 598258, 'owner': 'clink_q7u33'}, 
            {'id': '0000040809', 'pp': 528936, 'owner': 'clink_0eaum'}, 
            {'id': '0000042138', 'pp': 500162, 'owner': 'clink_x9wak'}, 
            {'id': '0000011003', 'pp': 439180, 'owner': 'chan_16744'}, 
            {'id': '0000030894', 'pp': 401514, 'owner': 'clink_0eaum'}, 
            {'id': '0000013182', 'pp': 355900, 'owner': 'iostpty'}, 
            {'id': '0000040831', 'pp': 331238, 'owner': 'clink_0eaum'}, 
            {'id': '0000036279', 'pp': 315772, 'owner': 'kotarawiost'}, 
            {'id': '0000041332', 'pp': 310140, 'owner': 'golfweekp'}, 
            {'id': '0000040828', 'pp': 270480, 'owner': 'clink_0eaum'}, 
            {'id': '0000041557', 'pp': 255127, 'owner': 'iostdaleast'}, 
            {'id': '0000028415', 'pp': 225477, 'owner': 'clink_0eaum'}, 
            {'id': '0000025866', 'pp': 207171, 'owner': 'clink_0eaum'}, 
            {'id': '0000028015', 'pp': 203803, 'owner': 'clink_qojng'}, 
            {'id': '0000027618', 'pp': 200140, 'owner': 'clink_0eaum'}, 
            {'id': '0000042493', 'pp': 199794, 'owner': 'mt81o_3348'}, 
            {'id': '0000040727', 'pp': 196848, 'owner': 'clink_0eaum'}, 
            {'id': '0000025855', 'pp': 190848, 'owner': 'clink_0eaum'}, 
            {'id': '0000025600', 'pp': 179478, 'owner': 'clink_x9wak'}, 
            {'id': '0000030434', 'pp': 173050, 'owner': 'z15lc_2827'}, 
            {'id': '0000043636', 'pp': 161286, 'owner': 'azmayyy'}, 
            {'id': '0000041079', 'pp': 137652, 'owner': 'iostpty'}, 
            {'id': '0000032061', 'pp': 134088, 'owner': 'y6809_2806'}]
        pp_rankings.update_ranking(rankings)
    else:
        pp_rankings.get_nfts()

    # pp_rankings.get_staked_nft()
    # pp_rankings.get_nft_owner('0000041706')
    # pp_rankings.get_user('0000043996')

    # pp_rankings.get_user('0000046329')
    # pp_rankings.get_user('0000046273')

