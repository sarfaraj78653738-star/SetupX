"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type { BrokerType } from "@/lib/broker-types";

export interface StoredBrokerCredentials {
  broker: BrokerType;
  kite?: { apiKey: string; accessToken: string };
  fyers?: { appId: string; secretKey: string; accessToken: string };
  angelone?: { apiKey: string; clientCode: string; mpin: string; totpSecret: string };
  groww?: { apiKey: string; accessToken: string };
}

const STORAGE_PREFIX = "bsr.broker";
const LEGACY_KITE_STORAGE_KEY = "bsr.kite";
const FYERS_PENDING_KEY = "bsr.fyers.pending";
const FYERS_AUTH_STATE = "fyers_auth";

function storageKey(): string {
  return STORAGE_PREFIX;
}

export function loadBrokerCreds(): StoredBrokerCredentials | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) {
      const legacyRaw = localStorage.getItem(LEGACY_KITE_STORAGE_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw);
        if (legacy?.apiKey && legacy?.accessToken) {
          const migrated: StoredBrokerCredentials = { broker: "kite", kite: legacy };
          localStorage.setItem(storageKey(), JSON.stringify(migrated));
          return migrated;
        }
      }
      return null;
    }
    const p = JSON.parse(raw);
    if (p?.broker) return p as StoredBrokerCredentials;
    if (p?.apiKey && p?.accessToken) {
      return { broker: "kite", kite: p };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveBrokerCreds(c: StoredBrokerCredentials | null) {
  if (typeof window === "undefined") return;
  if (!c) localStorage.removeItem(storageKey());
  else localStorage.setItem(storageKey(), JSON.stringify(c));
}

function getAuthEndpoint(broker: BrokerType): string {
  switch (broker) {
    case "kite": return "/api/kite/auth";
    case "fyers": return "/api/fyers/auth";
    case "angelone": return "/api/angelone/auth";
    case "groww": return "/api/groww/auth";
  }
}

function getBrokerLabel(broker: BrokerType): string {
  switch (broker) {
    case "kite": return "Zerodha Kite";
    case "fyers": return "Fyers";
    case "angelone": return "Angel One SmartAPI";
    case "groww": return "Groww";
  }
}

const BROKER_OPTIONS: Array<{ value: BrokerType; label: string }> = [
  { value: "kite", label: "Zerodha Kite" },
  { value: "fyers", label: "Fyers" },
  { value: "angelone", label: "Angel One SmartAPI" },
  { value: "groww", label: "Groww" },
];

interface BrokerSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCredentialsChange?: (creds: StoredBrokerCredentials | null) => void;
}

export default function BrokerSettings({ open, onOpenChange, onCredentialsChange }: BrokerSettingsProps) {
  const [selectedBroker, setSelectedBroker] = useState<BrokerType>("kite");
  const [apiKey, setApiKey] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [appId, setAppId] = useState("");
  const [mpin, setMpin] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [status, setStatus] = useState<"idle" | "verifying" | "ok" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [savedCreds, setSavedCreds] = useState<StoredBrokerCredentials | null>(null);
  const router = useRouter();

  const resetFields = useCallback(() => {
    setApiKey("");
    setAccessToken("");
    setSecretKey("");
    setClientCode("");
    setAppId("");
    setMpin("");
    setTotpSecret("");
  }, []);

  useEffect(() => {
    const c = loadBrokerCreds();
    if (c) {
      setSavedCreds(c);
      setSelectedBroker(c.broker);
      if (c.broker === "kite" && c.kite) {
        setApiKey(c.kite.apiKey);
        setAccessToken(c.kite.accessToken);
        setStatusMsg("Loaded saved Kite credentials.");
      } else if (c.broker === "fyers" && c.fyers) {
        setAppId(c.fyers.appId);
        setSecretKey(c.fyers.secretKey);
        setAccessToken(c.fyers.accessToken);
        setStatusMsg("Loaded saved Fyers credentials.");
      } else if (c.broker === "angelone" && c.angelone) {
        setApiKey(c.angelone.apiKey);
        setClientCode(c.angelone.clientCode);
        setMpin(c.angelone.mpin);
        setTotpSecret(c.angelone.totpSecret);
        setStatusMsg("Loaded saved Angel One credentials.");
      } else if (c.broker === "groww" && c.groww) {
        setApiKey(c.groww.apiKey);
        setAccessToken(c.groww.accessToken);
        setStatusMsg("Loaded saved Groww credentials.");
      }
    } else {
      resetFields();
    }
  }, [open, resetFields]);

  const buildRequestBody = (): Record<string, string> => {
    switch (selectedBroker) {
      case "kite": return { apiKey, accessToken };
      case "fyers": return { appId, secretKey, accessToken };
      case "angelone": return { apiKey, clientCode, mpin, totpSecret };
      case "groww": return { apiKey, accessToken };
    }
  };

  const buildStoredCreds = (): StoredBrokerCredentials => {
    switch (selectedBroker) {
      case "kite": return { broker: "kite", kite: { apiKey, accessToken } };
      case "fyers": return { broker: "fyers", fyers: { appId, secretKey, accessToken } };
      case "angelone": return { broker: "angelone", angelone: { apiKey, clientCode, mpin, totpSecret } };
      case "groww": return { broker: "groww", groww: { apiKey, accessToken } };
    }
  };

  const validateFields = (): string | null => {
    switch (selectedBroker) {
      case "kite":
        if (!apiKey || !accessToken) return "Both API Key and Access Token are required.";
        break;
      case "fyers":
        if (!accessToken) return "Access Token is required.";
        break;
      case "angelone":
        if (!apiKey || !clientCode || !mpin || !totpSecret) return "API Key, Client Code, MPIN, and TOTP Secret are all required.";
        break;
      case "groww":
        if (!accessToken) return "Access Token is required.";
        break;
    }
    return null;
  };

  const submitConnection = useCallback(async (
    endpoint: string,
    body: Record<string, string>,
    stored: StoredBrokerCredentials
  ): Promise<boolean> => {
    setStatus("verifying");
    setStatusMsg("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.status === "ok") {
        setStatus("ok");
        saveBrokerCreds(stored);
        setSavedCreds(stored);
        setStatusMsg(`Connected${json.user?.user_name ? ` as ${json.user.user_name}` : ""}. Live ${getBrokerLabel(stored.broker)} data is now active.`);
        onCredentialsChange?.(stored);
        setTimeout(() => {
          onOpenChange(false);
          router.refresh();
        }, 900);
        return true;
      } else {
        setStatus("error");
        setStatusMsg(json.error || "Verification failed — check your credentials.");
        return false;
      }
    } catch (e) {
      setStatus("error");
      setStatusMsg(e instanceof Error ? e.message : "Network error during verification.");
      return false;
    }
  }, [onCredentialsChange, onOpenChange, router]);

  const verify = async () => {
    const validationError = validateFields();
    if (validationError) {
      setStatus("error");
      setStatusMsg(validationError);
      return;
    }
    await submitConnection(getAuthEndpoint(selectedBroker), buildRequestBody(), buildStoredCreds());
  };

  const startFyersLogin = () => {
    if (!appId || !secretKey) return;
    localStorage.setItem(FYERS_PENDING_KEY, JSON.stringify({ appId, secretKey }));
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    const authUrl =
      `https://api-t1.fyers.in/api/v3/generate-authcode` +
      `?client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${redirectUri}` +
      `&response_type=code&state=${FYERS_AUTH_STATE}`;
    window.location.href = authUrl;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const authCode = params.get("auth_code");
    if (!authCode || params.get("state") !== FYERS_AUTH_STATE) return;

    let pending: { appId?: string; secretKey?: string } | null = null;
    try {
      const pendingRaw = localStorage.getItem(FYERS_PENDING_KEY);
      if (pendingRaw) pending = JSON.parse(pendingRaw);
    } catch {
      pending = null;
    }

    const cleanup = () => {
      try {
        localStorage.removeItem(FYERS_PENDING_KEY);
      } catch { /* ignore */ }
      const cleanUrl = window.location.pathname + window.location.search.replace(/[?&](auth_code|state)=[^&]*/g, "");
      const finalUrl = cleanUrl.replace(/[?&]$/, "");
      window.history.replaceState({}, "", finalUrl || window.location.pathname);
    };

    if (!pending?.appId || !pending?.secretKey) {
      cleanup();
      return;
    }

    const savedAppId = pending.appId;
    const savedSecretKey = pending.secretKey;
    setSelectedBroker("fyers");
    setAppId(savedAppId);
    setSecretKey(savedSecretKey);

    (async () => {
      try {
        const res = await fetch("/api/fyers/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appId: savedAppId, secretKey: savedSecretKey, authCode }),
        });
        const json = await res.json();
        if (json.status === "ok" && json.accessToken) {
          setAccessToken(json.accessToken);
          await submitConnection(
            "/api/fyers/auth",
            { appId: savedAppId, secretKey: savedSecretKey, accessToken: json.accessToken },
            { broker: "fyers", fyers: { appId: savedAppId, secretKey: savedSecretKey, accessToken: json.accessToken } }
          );
        } else {
          setStatus("error");
          setStatusMsg(json.error || "Fyers rejected the auth code");
        }
      } catch (e) {
        setStatus("error");
        setStatusMsg(e instanceof Error ? e.message : "Network error during Fyers login.");
      } finally {
        cleanup();
      }
    })();
  }, [submitConnection]);

  const disconnect = () => {
    saveBrokerCreds(null);
    resetFields();
    setSavedCreds(null);
    setStatus("idle");
    setStatusMsg("Disconnected. App will fall back to Yahoo Finance data.");
    onCredentialsChange?.(null);
    router.refresh();
  };

  const handleBrokerChange = (broker: BrokerType) => {
    setSelectedBroker(broker);
    resetFields();
    setStatus("idle");
    setStatusMsg("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-indigo-500/30 bg-[#0d1428] text-gray-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <KeyRound className="h-4 w-4 text-indigo-300" />
            Connect Broker (live trading data)
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Choose your broker and enter credentials. Once verified, the screener will fetch live NSE candles directly via your broker. Credentials are stored locally in your browser only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-gray-200">Broker</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {BROKER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleBrokerChange(opt.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedBroker === opt.value
                      ? "bg-indigo-500/30 text-indigo-100 border border-indigo-400/40"
                      : "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
                  }`}
                  type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {selectedBroker === "kite" && (
            <>
              <div>
                <Label htmlFor="kite-key" className="text-gray-200">API Key</Label>
                <Input id="kite-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="e.g. a1b2c3yourapikey" className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500" autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="kite-token" className="text-gray-200">Access Token</Label>
                <Input id="kite-token" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Login daily on console.zerodha.com → copy access token" className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500" autoComplete="off" type="password" />
              </div>
            </>
          )}

          {selectedBroker === "fyers" && (
            <>
              <div>
                <Label htmlFor="fyers-appid" className="text-gray-200">App ID</Label>
                <Input id="fyers-appid" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="e.g. X1Y2Z3ABCD" className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500" autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="fyers-secret" className="text-gray-200">Secret Key</Label>
                <Input id="fyers-secret" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="Your Fyers app secret key" className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500" autoComplete="off" type="password" />
              </div>
              <div>
                <Label className="text-gray-200">Access Token</Label>
                <Button
                  onClick={startFyersLogin}
                  disabled={!appId || !secretKey || status === "verifying"}
                  className="mt-1 w-full bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-50"
                  type="button"
                >
                  {status === "verifying" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  Login with Fyers
                </Button>
                <p className="mt-1 text-[11px] text-gray-500">
                  Logs in via Fyers OAuth and fills in the access token automatically.
                </p>
              </div>
            </>
          )}

          {selectedBroker === "angelone" && (
            <>
              <div>
                <Label htmlFor="angel-key" className="text-gray-200">API Key</Label>
                <Input id="angel-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Your Angel One API key" className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500" autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="angel-client" className="text-gray-200">Client Code</Label>
                <Input id="angel-client" value={clientCode} onChange={(e) => setClientCode(e.target.value)} placeholder="e.g. A123456" className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500" autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="angel-mpin" className="text-gray-200">MPIN</Label>
                <Input id="angel-mpin" value={mpin} onChange={(e) => setMpin(e.target.value)} placeholder="Your Angel One trading PIN" className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500" autoComplete="off" type="password" />
              </div>
              <div>
                <Label htmlFor="angel-totp" className="text-gray-200">TOTP Secret</Label>
                <Input id="angel-totp" value={totpSecret} onChange={(e) => setTotpSecret(e.target.value)} placeholder="From Angel One's TOTP/authenticator setup" className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500" autoComplete="off" type="password" />
                <p className="mt-1 text-[11px] text-gray-500">
                  Logs in automatically using these — no need to paste a 6-digit code or token each day.
                </p>
              </div>
            </>
          )}

          {selectedBroker === "groww" && (
            <>
              <div>
                <Label htmlFor="groww-key" className="text-gray-200">API Key</Label>
                <Input id="groww-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Your Groww API key" className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500" autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="groww-token" className="text-gray-200">Access Token</Label>
                <Input id="groww-token" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Your Groww access token" className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500" autoComplete="off" type="password" />
              </div>
            </>
          )}

          {status === "ok" && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}
          {status === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}
          {status === "idle" && statusMsg && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-gray-300">
              {statusMsg}
            </div>
          )}

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-100/80">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
              <div>
                <p className="mb-1 font-bold text-amber-200">Security & privacy</p>
                Your credentials are stored <strong>locally in this browser only</strong> (in <code>localStorage</code>). They never touch our server database. To keep them safe, never share your tokens, and disable unused keys from the broker developer console.
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {savedCreds && (
            <Button variant="ghost" onClick={disconnect} className="text-rose-200 hover:bg-rose-500/10 hover:text-rose-100">
              <Trash2 className="mr-2 h-4 w-4" /> Disconnect
            </Button>
          )}
          <Button onClick={verify} disabled={status === "verifying"} className="bg-indigo-500 text-white hover:bg-indigo-400">
            {status === "verifying" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {savedCreds ? "Re-verify & Save" : "Verify & Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BrokerStatusPill({
  connected,
  brokerLabel,
  onOpen,
}: {
  connected: boolean;
  brokerLabel?: string;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className={`bsr-chip ${connected ? "bsr-pass" : "bg-white/5 text-gray-300 border border-white/10"}`}
      style={{ cursor: "pointer" }}
      title={connected ? `${brokerLabel ?? "Broker"} connected` : "Connect broker for live data"}
    >
      {connected ? (
        <>
          <ShieldCheck className="h-3 w-3" /> {brokerLabel ?? "Live"}
        </>
      ) : (
        <>
          <KeyRound className="h-3 w-3" /> Connect Broker
        </>
      )}
    </button>
  );
}

export function useBrokerCreds(): StoredBrokerCredentials | null {
  const [creds, setCreds] = useState<StoredBrokerCredentials | null>(null);
  useEffect(() => {
    setCreds(loadBrokerCreds());
    const onStorage = () => setCreds(loadBrokerCreds());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return creds;
}
