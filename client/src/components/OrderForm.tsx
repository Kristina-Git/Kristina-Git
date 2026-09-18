import { FormEvent, useState } from "react";
import { api } from "../api";

interface ClientOption {
  id: string;
  fullName: string;
  clientCode?: string | null;
}

export default function OrderForm({
  clients,
  onCreated,
}: {
  clients?: ClientOption[]; // when provided, a dealer/admin is entering on behalf of a client
  onCreated: () => void;
}) {
  const [clientId, setClientId] = useState(clients?.[0]?.id ?? "");
  const [instrumentSymbol, setInstrumentSymbol] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "STOP">("LIMIT");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [timeInForce, setTimeInForce] = useState("DAY");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createOrder({
        ...(clients ? { clientId } : {}),
        instrumentSymbol,
        side,
        orderType,
        quantity: Number(quantity),
        ...(orderType !== "MARKET" ? { limitPrice: Number(limitPrice) } : {}),
        currency,
        timeInForce,
      });
      setInstrumentSymbol("");
      setQuantity("");
      setLimitPrice("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="order-form" onSubmit={onSubmit}>
      <h3>New order</h3>
      <div className="form-grid">
        {clients && (
          <label>
            Client
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} {c.clientCode ? `(${c.clientCode})` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Instrument symbol
          <input
            value={instrumentSymbol}
            onChange={(e) => setInstrumentSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL"
            required
          />
        </label>
        <label>
          Side
          <select value={side} onChange={(e) => setSide(e.target.value as "BUY" | "SELL")}>
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </label>
        <label>
          Order type
          <select value={orderType} onChange={(e) => setOrderType(e.target.value as typeof orderType)}>
            <option value="MARKET">Market</option>
            <option value="LIMIT">Limit</option>
            <option value="STOP">Stop</option>
          </select>
        </label>
        <label>
          Quantity
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min="0" step="any" required />
        </label>
        {orderType !== "MARKET" && (
          <label>
            Limit price
            <input
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              type="number"
              min="0"
              step="any"
              required
            />
          </label>
        )}
        <label>
          Currency
          <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} required />
        </label>
        <label>
          Time in force
          <select value={timeInForce} onChange={(e) => setTimeInForce(e.target.value)}>
            <option value="DAY">Day</option>
            <option value="GTC">Good till cancelled</option>
            <option value="IOC">Immediate or cancel</option>
            <option value="FOK">Fill or kill</option>
          </select>
        </label>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <button type="submit" disabled={busy}>
        {busy ? "Submitting…" : "Submit order"}
      </button>
    </form>
  );
}
