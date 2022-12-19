import { AccountData, EncodeObject } from "@cosmjs/proto-signing";
import {
  assertIsDeliverTxSuccess,
  Coin,
  DeliverTxResponse,
} from "@cosmjs/stargate";
import { ChainInfo } from "@keplr-wallet/types";
import { DelegationResponse } from "cosmjs-types/cosmos/staking/v1beta1/staking";
import { Any } from "cosmjs-types/google/protobuf/any";
import { BigNumber } from "ethers";
import { Denom } from "kujira.js";
import {
  createContext,
  FC,
  useContext,
  useEffect,
  useState,
} from "react";
import QRCode from "react-qr-code";
import { Modal } from "../../components/Modal";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useNetwork } from "../network";
import { useKeplr } from "./useKeplr";
import { useSonar } from "./useSonar";

export enum Adapter {
  Sonar = "sonar",
  Keplr = "keplr",
}

export type IWallet = {
  adapter: Adapter;
  setAdapter: (a: Adapter) => void;
  connect: null | ((chain?: string) => void);
  disconnect: () => void;
  account: AccountData | null;
  kujiraAccount: Any | null;
  balances: Coin[];
  getBalance: (
    denom: Denom,
    refresh?: boolean
  ) => Promise<BigNumber | null>;
  balance: (denom: Denom) => BigNumber;
  signAndBroadcast: (
    msgs: EncodeObject[]
  ) => Promise<DeliverTxResponse>;
  delegations: null | DelegationResponse[];
  refreshBalances: () => void;
  refreshDelegations: () => void;
  feeDenom: string;
  setFeeDenom: (denom: string) => void;
  chainInfo: ChainInfo;
};

const Context = createContext<IWallet>({
  adapter: Adapter.Sonar,
  setAdapter: () => {},
  account: null,
  getBalance: async () => BigNumber.from(0),
  balance: () => BigNumber.from(0),
  connect: null,
  disconnect: () => {},
  kujiraAccount: null,
  balances: [],
  signAndBroadcast: async () => {
    throw new Error("Not Implemented");
  },

  delegations: null,
  refreshBalances: () => {},
  refreshDelegations: () => {},
  feeDenom: "ukuji",
  setFeeDenom: () => {},
  chainInfo: {} as ChainInfo,
});

export const WalletContext: FC = ({ children }) => {
  const [adapter, setAdapter] = useState(Adapter.Keplr);
  const [feeDenom, setFeeDenom] = useLocalStorage(
    "feeDenom",
    "ukuji"
  );
  const [balances, setBalances] = useState<Record<string, BigNumber>>(
    {}
  );

  const [kujiraBalances, setKujiraBalances] = useState<Coin[]>([]);

  useEffect(() => {
    document.onkeyup = function (e) {
      if (e.ctrlKey && e.shiftKey && e.key == "W") {
        setAdapter(
          adapter === Adapter.Sonar ? Adapter.Keplr : Adapter.Sonar
        );
      }
    };
  }, [adapter]);

  const [{ network, chainInfo, query }] = useNetwork();
  const [link, setLink] = useState("");
  const [modal, setModal] = useState(false);

  const [kujiraAccount, setKujiraAccount] = useState<null | Any>(
    null
  );

  const [delegations, setDelegations] = useState<
    null | DelegationResponse[]
  >(null);

  const sonar = useSonar({
    feeDenom,
    setLink,
    setModal,
  });

  const keplr = useKeplr({ feeDenom });

  const connector = adapter === Adapter.Sonar ? sonar : keplr;
  const { account } = connector;

  const refreshBalances = () => {
    if (!account) return;
    query?.bank.allBalances(account.address).then((x) => {
      x && setKujiraBalances(x);
      x?.map((b) => {
        setBalances((prev) =>
          b.denom
            ? {
                ...prev,
                [b.denom]: BigNumber.from(b.amount),
              }
            : prev
        );
      });
    });
  };

  useEffect(() => {
    setKujiraBalances([]);
    setBalances({});
    refreshBalances();
  }, [account, query]);

  useEffect(() => {
    if (!account) return;
    query?.auth
      .account(account.address)
      .then((account) => account && setKujiraAccount(account));
  }, [account, query]);

  const refreshDelegations = () => {
    if (!account) return;
    setDelegations(null);
    query?.staking
      .delegatorDelegations(account.address)
      .then(
        ({ delegationResponses }) =>
          delegationResponses && setDelegations(delegationResponses)
      );
  };

  useEffect(() => {
    refreshDelegations();
  }, [account, query]);

  const balance = (denom: Denom): BigNumber =>
    balances[denom.reference] || BigNumber.from(0);

  const fetchBalance = async (denom: Denom): Promise<BigNumber> => {
    if (!account) return BigNumber.from(0);
    if (!query) return BigNumber.from(0);
    return query.bank
      .balance(account?.address || "", denom.reference)
      .then((resp) => BigNumber.from(resp?.amount || 0))
      .then((balance) => {
        setBalances((prev) => ({
          ...prev,
          [denom.reference]: balance,
        }));
        return balance;
      });
  };

  const getBalance = async (denom: Denom, refresh = true) =>
    balances[denom.reference] || refresh
      ? fetchBalance(denom)
      : BigNumber.from(0);

  const signAndBroadcast = async (
    msgs: EncodeObject[]
  ): Promise<DeliverTxResponse> => {
    if (!account) throw new Error("No Wallet Connected");
    const res = await connector.signAndBroadcast(msgs);
    assertIsDeliverTxSuccess(res);
    return res;
  };

  return (
    <Context.Provider
      key={network + account?.address}
      value={{
        adapter,
        setAdapter,
        account,
        delegations,
        connect: connector.connect,
        disconnect: connector.disconnect,
        kujiraAccount,
        balances: kujiraBalances,
        getBalance,
        balance,
        signAndBroadcast,
        refreshBalances,
        refreshDelegations,
        feeDenom,
        setFeeDenom,
        chainInfo,
      }}>
      {children}
      <Modal
        show={modal}
        close={() => setModal(false)}
        className="modal--auto">
        <QRCode value={link} />
      </Modal>
    </Context.Provider>
  );
};

export function useWallet() {
  return useContext(Context);
}
