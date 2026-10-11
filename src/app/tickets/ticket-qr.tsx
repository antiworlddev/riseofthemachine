'use client';
import {useEffect,useRef,useState} from 'react';
import QRCode from 'qrcode';
export default function TicketQR({code}:{code:string}){
 const canvas=useRef<HTMLCanvasElement>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{setFailed(false);if(canvas.current)void QRCode.toCanvas(canvas.current,code,{width:256,margin:4,errorCorrectionLevel:'M',color:{dark:'#000000',light:'#ffffff'}}).catch(()=>setFailed(true));},[code]);
 return <div>{failed?<p>QR could not render. Use the ticket code below.</p>:<canvas ref={canvas} className="ticket-qr" role="img" aria-label="Private ticket QR code"/>}</div>;
}
