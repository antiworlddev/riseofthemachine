import MerchOrders from '../../merch/merch-orders';
export const metadata={title:'Merch operations | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><h1>MERCH OPERATIONS<span className="red">.</span></h1><p>Prepare paid pickups, confirm delivery arrangements and track fulfilment.</p><MerchOrders admin/></section></div>;}
