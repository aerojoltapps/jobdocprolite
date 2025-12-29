
import { UserData, DocumentResult, PackageType, JobRole } from './types';
import { generateJobDocuments } from './services/geminiService';
import { PRICING, RAZORPAY_KEY_ID } from './constants';
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useSearchParams } from 'react-router-dom';
import Layout from './components/Layout';
import ResumeForm from './components/ResumeForm';
import DocumentPreview from './components/DocumentPreview';
import Gallery from './components/Gallery';

const PackageCard: React.FC<{ pkgKey: string; data: any; onSelect?: (key: PackageType) => void; isSelected?: boolean }> = ({ 
  pkgKey, data, onSelect, isSelected = false 
}) => {
  const isFeatured = pkgKey === PackageType.JOB_READY_PACK;
  return (
    <div className={`bg-white p-10 rounded-[2.5rem] shadow-sm border flex flex-col hover:shadow-xl transition-all duration-300 ${isFeatured ? 'ring-4 ring-blue-600 relative border-transparent' : 'border-gray-100'} ${isSelected ? 'border-blue-600 ring-2' : ''}`}>
      {isFeatured && <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">Best Value</span>}
      <h3 className="text-xl font-bold mb-4">{data.label}</h3>
      <div className="text-5xl font-black mb-8">₹{data.price}</div>
      <ul className="text-left space-y-4 mb-10 flex-grow text-sm text-gray-600 font-medium">
        {data.features.map((f: string, i: number) => <li key={i} className="flex items-start gap-2"><span className="text-blue-600 font-bold">✓</span> {f}</li>)}
      </ul>
      {onSelect ? (
        <button onClick={() => onSelect(pkgKey as PackageType)} className={`w-full py-4 rounded-xl font-bold text-center transition ${isFeatured ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}>
          {isSelected ? 'Selected' : 'Select Plan'}
        </button>
      ) : (
        <Link to={`/builder?package=${pkgKey}`} className={`w-full py-4 rounded-xl font-bold text-center transition ${isFeatured ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}>Get Started</Link>
      )}
    </div>
  );
};

const Home = () => (
  <Layout>
    <div className="overflow-hidden">
      <section className="relative bg-white pt-20 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[2px] mb-6">Best Professional Resume Service in India</span>
          <h1 className="text-5xl md:text-7xl font-black text-gray-900 leading-[1.05] tracking-tight mb-8">Get a job-ready resume <br className="hidden md:block" /> <span className="text-blue-600">in 15 minutes.</span></h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-12 font-semibold">ATS-friendly resume writing services for Indian professionals. No AI skills needed.</p>
          <Link to="/builder" className="px-12 py-6 bg-blue-600 text-white text-xl font-black rounded-2xl hover:bg-blue-700 transition transform hover:scale-105 shadow-2xl">🟢 Build My Resume Now</Link>
        </div>
      </section>
    </div>
  </Layout>
);

const Builder = () => {
  const [searchParams] = useSearchParams();
  const [selectedPackage, setSelectedPackage] = useState<PackageType | null>(searchParams.get('package') as PackageType | null);
  const [userData, setUserData] = useState<UserData | null>(() => {
    const saved = localStorage.getItem('jdp_draft');
    return saved ? JSON.parse(saved) : null;
  });

  const [result, setResult] = useState<DocumentResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCheckout, setIsCheckout] = useState(false);
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);

  const [paidIdentifiers, setPaidIdentifiers] = useState<string[]>(() => JSON.parse(localStorage.getItem(btoa('jdp_v2_paid_ids')) || '[]'));
  const [creditsMap, setCreditsMap] = useState<Record<string, number>>(() => JSON.parse(localStorage.getItem(btoa('jdp_v2_credits_log')) || '{}'));

  const getIdentifier = (email: string, phone: string) => `${email.toLowerCase().trim()}_${phone.trim()}`;
  const currentId = userData ? getIdentifier(userData.email, userData.phone) : '';
  const isPaid = paidIdentifiers.includes(currentId);
  const remainingCredits = creditsMap[currentId] || 0;

  useEffect(() => {
    if (userData) localStorage.setItem('jdp_draft', JSON.stringify(userData));
    localStorage.setItem(btoa('jdp_v2_paid_ids'), JSON.stringify(paidIdentifiers));
    localStorage.setItem(btoa('jdp_v2_credits_log'), JSON.stringify(creditsMap));
  }, [userData, paidIdentifiers, creditsMap]);

  const onFormSubmit = async (data: UserData) => {
    const id = getIdentifier(data.email, data.phone);
    setUserData(data);
    setIsGenerating(true);
    setResult(null);

    try {
      const generated = await generateJobDocuments(data, id);
      setResult(generated);
      setPaidIdentifiers(prev => prev.includes(id) ? prev : [...prev, id]);
      if (generated.remainingCredits !== undefined) setCreditsMap(prev => ({ ...prev, [id]: generated.remainingCredits! }));
      window.scrollTo(0, 0);
    } catch (e: any) {
      if (e.message.includes('Payment Required')) setIsCheckout(true);
      else alert(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRazorpayCheckout = async () => {
    if (!userData || !selectedPackage) return;
    setIsProcessingOrder(true);

    try {
      // 1. Securely Create Order on Server
      const orderRes = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageType: selectedPackage })
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error);

      // 2. Open Razorpay
      const rzp = (window as any).Razorpay;
      const options = {
        key: RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "JobDocPro",
        description: PRICING[selectedPackage].label,
        order_id: order.id,
        handler: async function(response: any) {
          const sync = await fetch('/api/verify', {
            method: 'POST',
            body: JSON.stringify({
              identifier: currentId,
              paymentId: response.razorpay_payment_id,
              orderId: response.razorpay_order_id,
              signature: response.razorpay_signature,
              packageType: selectedPackage
            })
          });
          if (sync.ok) {
            setPaidIdentifiers(prev => [...prev, currentId]);
            setCreditsMap(prev => ({ ...prev, [currentId]: 3 }));
            setIsCheckout(false);
            onFormSubmit(userData);
          }
        },
        prefill: { name: userData.fullName, email: userData.email, contact: userData.phone },
        theme: { color: "#2563eb" }
      };
      new rzp(options).open();
    } catch (e: any) {
      alert("Order failed: " + e.message);
    } finally {
      setIsProcessingOrder(false);
    }
  };

  if (!selectedPackage) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto py-16 px-4 text-center">
          <h1 className="text-4xl font-black mb-12">Select Your Plan</h1>
          <div className="grid md:grid-cols-3 gap-8">
            {Object.entries(PRICING).map(([key, val]) => <PackageCard key={key} pkgKey={key} data={val} onSelect={setSelectedPackage} />)}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto py-10 px-4 min-h-[60vh]">
        {isGenerating && (
          <div className="fixed inset-0 z-[60] bg-white/90 backdrop-blur-md flex items-center justify-center animate-fadeIn">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
              <h2 className="text-2xl font-black mb-2 tracking-tight">AI Sandbox Running...</h2>
              <p className="text-gray-500 font-medium">Delivering Secure Content</p>
            </div>
          </div>
        )}
        {result && userData ? (
          <DocumentPreview user={userData} result={result} packageType={selectedPackage} isPreview={!isPaid} onUnlock={() => setIsCheckout(true)} 
            onRefine={isPaid ? (f: string) => onFormSubmit({ ...userData, refinementFeedback: f }) : undefined} remainingCredits={remainingCredits} />
        ) : (
          <ResumeForm onSubmit={onFormSubmit} isLoading={isGenerating} initialData={userData} />
        )}
      </div>

      {isCheckout && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white p-12 rounded-[3rem] max-w-xl w-full text-center shadow-2xl border border-blue-100">
            <h2 className="text-3xl font-black mb-6 tracking-tight">Complete Checkout</h2>
            <div className="bg-blue-600 p-8 rounded-3xl mb-8 text-white shadow-lg">
               <div className="text-6xl font-black tracking-tighter">₹{PRICING[selectedPackage].price}</div>
               <div className="text-xs font-bold uppercase tracking-widest mt-2 opacity-70">Server-Side Verified Price</div>
            </div>
            <button disabled={isProcessingOrder} onClick={handleRazorpayCheckout} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-blue-700 shadow-xl disabled:opacity-50">
              {isProcessingOrder ? 'Securing Link...' : 'Pay Securely'}
            </button>
            <button onClick={() => setIsCheckout(false)} className="mt-4 text-gray-400 font-bold text-xs uppercase tracking-widest">Return to Editor</button>
          </div>
        </div>
      )}
    </Layout>
  );
};

const App: React.FC = () => (
  <Router>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/builder" element={<Builder />} />
      <Route path="/samples" element={<Gallery />} />
    </Routes>
  </Router>
);

export default App;
