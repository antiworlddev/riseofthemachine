import Inventory from './inventory';
export const metadata={title:'Merch inventory | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><h1>MERCH INVENTORY<span className="red">.</span></h1><p><a href="/admin/merch">Merch orders and fulfilment</a> · <a href="/admin/merch/shipping">Delivery rates</a></p><p>Available = total capacity − reserved − sold. Capacity includes units already sold. Test and live orders share this inventory.</p><Inventory/></section></div>;}
