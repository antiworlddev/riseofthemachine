import type { Metadata } from "next";
import TicketOrders from "../ticket-orders";
export const metadata: Metadata = {
  title: "Payment confirmation | RISE OF THE MACHINE",
  robots: { index: false, follow: false },
};
export default function ConfirmationPage() {
  return (
    <section className="registration-page">
      <h1>
        TICKETS PAYMENT CONFIRMATION<span className="red">.</span>
      </h1>
      <TicketOrders confirmPayment />
    </section>
  );
}
