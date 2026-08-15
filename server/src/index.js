import express from 'express';
import cors from 'cors';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

const config = JSON.parse(fs.readFileSync('./config/appsettings.json'));

app.get('/api/health',(req,res)=>{
 res.json({status:'ok'});
});

app.post('/api/payment/start',(req,res)=>{
 if(config.Payment.IsSandboxMode){
   return res.json({success:true,status:'Paid',mode:'sandbox',refId:'TEST-'+Date.now()});
 }
 if(!config.Payment.ZarinPal.MerchantId){
   return res.status(500).json({success:false,message:'ZarinPal MerchantId is not configured'});
 }
 return res.json({success:false,message:'ZarinPal gateway flow ready for merchant configuration'});
});

app.listen(5000,()=>console.log('SportCarJavid API running on 5000'));
