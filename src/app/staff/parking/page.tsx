import Scanner from '../check-in/scanner';
export const metadata={title:'VIP parking check-in | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">Staff access</p><h1>VIP PARKING<span className="red">.</span></h1><p>Each pass admits one vehicle once. Parking entry does not consume a concert admission.</p><p><a href="/staff/check-in">Concert check-in</a> · <a href="/admin/tables">Table bookings</a></p><Scanner parking/></section></div>;}
