import type {Metadata} from 'next';
import TicketOrders from '../ticket-orders';
export const metadata:Metadata={title:'My tickets | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function OrdersPage(){return <section className="registration-page"><h1>MY TICKETS<span className="red">.</span></h1><TicketOrders/></section>;}
