import TicketCheckout from "./ticket-checkout";
export default function TicketsPage() {
  return (
    <section className="registration-page">
      <p className="eyebrow">20 DECEMBER 2026 · ABUJA</p>
      <h1>
        TICKETS BOOTH<span className="red">*</span>
      </h1>
      <p className="intro">ODUMODUBLVCK LIVE: RISE OF THE MACHINE</p>
      <TicketCheckout />
    </section>
  );
}
