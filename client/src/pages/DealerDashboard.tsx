import { useEffect, useState } from "react";
import { api, ClientAccount, Order } from "../api";
import OrderForm from "../components/OrderForm";
import OrderTable from "../components/OrderTable";
import OrderDetail from "../components/OrderDetail";

export default function DealerDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [filter, setFilter] = useState<string>("");

  async function refresh() {
    const list = await api.listOrders(filter ? { status: filter } : {});
    setOrders(list);
    if (selected) setSelected(await api.getOrder(selected.id));
  }

  useEffect(() => {
    api.clients().then(setClients);
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function select(id: string) {
    setSelected(await api.getOrder(id));
  }

  return (
    <div className="dashboard two-col">
      <div>
        <OrderForm clients={clients} onCreated={refresh} />
        <section>
          <div className="section-header">
            <h3>Order blotter</h3>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="PENDING_REVIEW">Pending review</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="PENDING_COMPLIANCE_APPROVAL">Pending compliance approval</option>
              <option value="COMPLIANCE_APPROVED">Compliance approved</option>
              <option value="EXECUTED">Executed</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <OrderTable orders={orders} onSelect={select} selectedId={selected?.id} showClient />
        </section>
      </div>
      <div>{selected && <OrderDetail order={selected} onChanged={refresh} />}</div>
    </div>
  );
}
