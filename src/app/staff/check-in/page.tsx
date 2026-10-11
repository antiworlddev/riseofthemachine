import type {Metadata} from 'next';
import Scanner from './scanner';
export const metadata:Metadata={title:'Staff check-in | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function CheckInPage(){return <section className="registration-page"><p className="eyebrow">STAFF ACCESS</p><h1>TICKET CHECK-IN<span className="red">.</span></h1><Scanner/></section>;}
