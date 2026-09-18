import { useEffect, useState } from "react";
import { api, Order } from "../api";
import OrderForm from "../components/OrderForm";
import OrderTable from "../components/OrderTable";
import OrderDetail from "../components/OrderDetail";

export default function ClientDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);

  async function refresh() {
    const list = await api.listOrders();
    setOrders(list);
    if (selected) {
      const fresh = await api.getOrder(selected.id);
      setSelected(fresh);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function select(id: string) {
    setSelected(await api.getOrder(id));
  }

  return (
    <div className="dashboard two-col">
      <div>
        <OrderForm onCreated={refresh} />
        <section>
          <div className="section-header">
            <h3>My orders</h3>
            <button onClick={() => api.downloadOrdersCsv()}>Export CSV</button>
          </div>
          <OrderTable orders={orders} onSelect={select} selectedId={selected?.id} />
        </section>
      </div>
      <div>{selected && <OrderDetail order={selected} onChanged={refresh} />}</div>
    </div>
  );
}
