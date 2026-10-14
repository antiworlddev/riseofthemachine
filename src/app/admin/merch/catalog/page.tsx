import CatalogDashboard from './catalog-dashboard';
export const metadata={title:'Merch catalogue | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">Organizer access</p><h1>MERCH CATALOGUE<span className="red">.</span></h1><p>Prepare the collection, product images, prices and sizes.</p><CatalogDashboard/></section></div>;}
