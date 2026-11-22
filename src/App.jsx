import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ShoppingCart, Search, MapPin, Plus, Minus, Trash2, Sparkles, ExternalLink,
  Store, Tag, ArrowRight, Package, Copy, Check, AlertCircle, Layers, Truck,
  ShoppingBag, Cloud, RefreshCw, Chrome, PlusCircle, Clock, WheatOff, Bookmark, FolderOpen
} from 'lucide-react';

const STORES = {
  dm: { id: 'dm', name: 'dm-drogerie', short: 'dm', color: 'bg-blue-900 text-white', onlineOrder: true },
  rewe: { id: 'rewe', name: 'REWE Markt', short: 'REWE', color: 'bg-red-600 text-white', onlineOrder: true },
  lidl: { id: 'lidl', name: 'Lidl Filiale', short: 'Lidl', color: 'bg-yellow-400 text-blue-950', onlineOrder: false },
  aldi: { id: 'aldi', name: 'Aldi Filiale', short: 'Aldi', color: 'bg-sky-600 text-white', onlineOrder: false },
};

function getAldiRegion(plz) {
  const prefix = parseInt(plz.slice(0, 2), 10);
  if (isNaN(prefix)) return 'Aldi Nord / Süd';
  if ([1, 2, 3, 4, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 37, 38, 39, 44, 45, 46, 47, 48, 49, 58, 59, 98, 99].includes(prefix)) {
    return 'Aldi Nord';
  }
  return 'Aldi Süd';
}

const formatEur = (val) =>
  val === null || val === undefined
    ? '–'
    : val.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export default function App() {
  const [products, setProducts] = useState([]);
  const [plz, setPlz] = useState('37308');
  const [plzInput, setPlzInput] = useState('37308');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickAddQuery, setQuickAddQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Alle');
  const [onlyGlutenFree, setOnlyGlutenFree] = useState(false);
  const [strategy, setStrategy] = useState('split');
  const [shoppingList, setShoppingList] = useState([]);
  const [savedCarts, setSavedCarts] = useState([]);
  const [saveCartName, setSaveCartName] = useState('');
  const [showSavedCartsPanel, setShowSavedCartsPanel] = useState(false);
  const [syncStatus, setSyncStatus] = useState('loading');
  const [extensionInstalled, setExtensionInstalled] = useState(false);

  const [priceSyncState, setPriceSyncState] = useState({ running: false, message: '' });

  // Neues Produkt Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newProd, setNewProd] = useState({
    name: '', category: 'Glutenfrei Spezial', unit: '1 Stück', isGlutenFree: true,
    rewePrice: '', reweId: '', dmPrice: '', dmDan: '', lidlPrice: '', aldiPrice: '',
  });

  // Checkout Modal
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [dmDeliveryMode, setDmDeliveryMode] = useState('express');
  const [reweDeliveryMode, setReweDeliveryMode] = useState('pickup');
  const [orderFeedback, setOrderFeedback] = useState({ dm: null, rewe: null });
  const [copiedJson, setCopiedJson] = useState(false);
  const [checkedOfflineItems, setCheckedOfflineItems] = useState({});

  const loadProducts = useCallback(async () => {
    const prodRes = await fetch('/api/products');
    if (prodRes.ok) {
      const prodData = await prodRes.json();
      if (prodData.ok && Array.isArray(prodData.products)) {
        setProducts(prodData.products);
      }
    }
  }, []);

  const loadSavedCarts = useCallback(async () => {
    const res = await fetch('/api/saved-carts');
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.carts)) {
        setSavedCarts(data.carts);
      }
    }
  }, []);

  useEffect(() => {
    const handleExtensionMessage = async (event) => {
      if (event.data?.type === 'SMARTCART_EXTENSION_READY') setExtensionInstalled(true);
      if (event.data?.type === 'SMARTCART_CART_RESULT') {
        const { store, status, count } = event.data;
        setOrderFeedback((prev) => ({
          ...prev,
          [store]: status === 'ok' ? `Erfolgreich (${count} Artikel im Tab befüllt)` : 'Tab geöffnet – Bitte Shop-Login prüfen',
        }));
      }
      if (event.data?.type === 'SMARTCART_REWE_PRICES_RESULT') {
        const updates = event.data.updates || [];
        if (updates.length > 0) {
          await fetch('/api/sync-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates }),
          });
          await loadProducts();
        }
        setPriceSyncState((prev) => ({
          running: false,
          message: `${prev.message} · REWE: ${updates.length} Live-Preise aktualisiert`,
        }));
      }
    };
    window.addEventListener('message', handleExtensionMessage);
    window.postMessage({ type: 'SMARTCART_PING_EXTENSION' }, '*');
    return () => window.removeEventListener('message', handleExtensionMessage);
  }, [loadProducts]);

  useEffect(() => {
    async function loadInitialData() {
      try {
        await Promise.all([loadProducts(), loadSavedCarts()]);
        const listRes = await fetch('/api/list');
        if (listRes.ok) {
          const listData = await listRes.json();
          if (listData.ok) {
            setPlz(listData.plz || '37308');
            setPlzInput(listData.plz || '37308');
            setStrategy(listData.strategy || 'split');
            setShoppingList(listData.list || []);
            setSyncStatus('synced');
            return;
          }
        }
        setSyncStatus('offline');
      } catch {
        setSyncStatus('offline');
      }
    }
    loadInitialData();
  }, [loadProducts, loadSavedCarts]);

  const persistState = useCallback(async (nextList, nextPlz, nextStrategy) => {
    if (syncStatus === 'offline') return;
    setSyncStatus('saving');
    try {
      await fetch('/api/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plz: nextPlz, strategy: nextStrategy, list: nextList }),
      });
      setSyncStatus('synced');
    } catch {
      setSyncStatus('offline');
    }
  }, [syncStatus]);

  const handleSaveCurrentCart = async (e) => {
    e.preventDefault();
    if (!saveCartName.trim() || shoppingList.length === 0) return;
    const res = await fetch('/api/saved-carts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: saveCartName.trim(), items: shoppingList }),
    });
    if (res.ok) {
      setSaveCartName('');
      await loadSavedCarts();
    }
  };

  const handleLoadSavedCart = (items, mode = 'replace') => {
    setShoppingList((prev) => {
      let next;
      if (mode === 'replace') {
        next = items;
      } else {
        const map = new Map(prev.map((i) => [i.id, i.qty]));
        items.forEach((i) => map.set(i.id, (map.get(i.id) || 0) + i.qty));
        next = Array.from(map.entries()).map(([id, qty]) => ({ id, qty }));
      }
      persistState(next, plz, strategy);
      return next;
    });
    setShowSavedCartsPanel(false);
  };

  const handleDeleteSavedCart = async (id) => {
    await fetch(`/api/saved-carts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadSavedCarts();
  };

  const handleRefreshLivePrices = async () => {
    setPriceSyncState({ running: true, message: 'Rufe Live-Preise von dm & Lidl ab...' });
    try {
      const res = await fetch('/api/refresh-server-prices', { method: 'POST' });
      const data = await res.json();
      await loadProducts();
      const serverMsg = data.ok ? `dm (${data.dmUpdated}) & Lidl (${data.lidlUpdated}) aktualisiert` : 'Server-Abruf fertig';

      if (extensionInstalled) {
        setPriceSyncState({ running: true, message: `${serverMsg} · Frage REWE-Preise über Chrome ab...` });
        const targetIds = new Set(shoppingList.map((i) => i.id));
        products.slice(0, 25).forEach((p) => targetIds.add(p.id));
        const queries = products
          .filter((p) => targetIds.has(p.id))
          .map((p) => ({ productId: p.id, query: p.prices?.rewe?.searchQuery || p.name }));
        window.postMessage({ type: 'SMARTCART_SCRAPE_REWE', queries, plz }, '*');
      } else {
        setPriceSyncState({ running: false, message: `${serverMsg} (Für REWE-Preise Chrome-Bridge aktivieren)` });
      }
    } catch {
      setPriceSyncState({ running: false, message: 'Fehler beim Preisabruf' });
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!newProd.name.trim()) return;
    await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newProd.name.trim(),
        category: newProd.category,
        unit: newProd.unit,
        isGlutenFree: newProd.isGlutenFree,
        prices: {
          rewe: { price: newProd.rewePrice, externalId: newProd.reweId, searchQuery: newProd.name },
          dm: { price: newProd.dmPrice, externalId: newProd.dmDan, searchQuery: newProd.dmPrice ? newProd.name : null },
          lidl: { price: newProd.lidlPrice, searchQuery: newProd.name },
          aldi: { price: newProd.aldiPrice, searchQuery: newProd.name },
        },
      }),
    });
    await loadProducts();
    setNewProd({
      name: '', category: 'Glutenfrei Spezial', unit: '1 Stück', isGlutenFree: true,
      rewePrice: '', reweId: '', dmPrice: '', dmDan: '', lidlPrice: '', aldiPrice: '',
    });
    setAddModalOpen(false);
  };

  const aldiRegion = useMemo(() => getAldiRegion(plz), [plz]);
  const categories = useMemo(() => ['Alle', ...Array.from(new Set(products.map((p) => p.category)))], [products]);

  const filteredCatalog = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = selectedCategory === 'Alle' || p.category === selectedCategory;
      const matchesGf = !onlyGlutenFree || p.isGlutenFree;
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesGf && matchesSearch;
    });
  }, [products, selectedCategory, onlyGlutenFree, searchQuery]);

  // Quick-Add Vorschläge direkt über der Einkaufsliste
  const quickAddMatches = useMemo(() => {
    const q = quickAddQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => (!onlyGlutenFree || p.isGlutenFree) && (p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [products, quickAddQuery, onlyGlutenFree]);

  const detailedList = useMemo(() => {
    return shoppingList
      .map((item) => {
        const product = products.find((p) => p.id === item.id);
        if (!product) return null;
        const availableStores = Object.entries(product.prices || {})
          .filter(([, data]) => data && data.price !== null && data.price !== undefined)
          .map(([storeId, data]) => ({ storeId, ...data }));
        const cheapestOverall = availableStores.reduce((min, curr) => (curr.price < min.price ? curr : min), availableStores[0]);
        const onlineStores = availableStores.filter((s) => STORES[s.storeId]?.onlineOrder);
        const cheapestOnline = onlineStores.length
          ? onlineStores.reduce((min, curr) => (curr.price < min.price ? curr : min), onlineStores[0])
          : null;
        return { ...product, qty: item.qty, cheapestOverall, cheapestOnline };
      })
      .filter(Boolean);
  }, [shoppingList, products]);

  const storeTotals = useMemo(() => {
    const totals = { dm: 0, rewe: 0, lidl: 0, aldi: 0 };
    const missing = { dm: [], rewe: [], lidl: [], aldi: [] };
    detailedList.forEach((item) => {
      Object.keys(STORES).forEach((storeId) => {
        const storeInfo = item.prices?.[storeId];
        if (storeInfo && storeInfo.price !== null && storeInfo.price !== undefined) {
          totals[storeId] += storeInfo.price * item.qty;
        } else {
          missing[storeId].push(item.name);
        }
      });
    });
    return { totals, missing };
  }, [detailedList]);

  const bestSingleStore = useMemo(() => {
    let bestId = 'rewe';
    let lowest = Infinity;
    Object.entries(storeTotals.totals).forEach(([id, total]) => {
      if (storeTotals.missing[id].length === 0 && total < lowest && total > 0) {
        lowest = total;
        bestId = id;
      }
    });
    if (lowest === Infinity) {
      Object.entries(storeTotals.totals).forEach(([id, total]) => {
        if (total < lowest && total > 0) {
          lowest = total;
          bestId = id;
        }
      });
    }
    return { id: bestId, total: lowest === Infinity ? 0 : lowest };
  }, [storeTotals]);

  const activePlan = useMemo(() => {
    const buckets = { dm: [], rewe: [], lidl: [], aldi: [] };
    let totalCost = 0;
    detailedList.forEach((item) => {
      let chosenStore = null;
      let chosenData = null;
      if (strategy === 'single') {
        const sId = bestSingleStore.id;
        if (item.prices?.[sId]?.price !== null && item.prices?.[sId]?.price !== undefined) {
          chosenStore = sId;
          chosenData = item.prices[sId];
        } else if (item.cheapestOverall) {
          chosenStore = item.cheapestOverall.storeId;
          chosenData = item.cheapestOverall;
        }
      } else if (strategy === 'online_only') {
        if (item.cheapestOnline) {
          chosenStore = item.cheapestOnline.storeId;
          chosenData = item.cheapestOnline;
        }
      } else {
        if (item.cheapestOverall) {
          chosenStore = item.cheapestOverall.storeId;
          chosenData = item.cheapestOverall;
        }
      }
      if (chosenStore && chosenData) {
        const lineTotal = chosenData.price * item.qty;
        totalCost += lineTotal;
        buckets[chosenStore].push({
          ...item,
          chosenPrice: chosenData.price,
          lineTotal,
          promo: chosenData.promo,
          promoLabel: chosenData.promoLabel,
          externalId: chosenData.externalId,
          brandName: chosenData.brandName,
        });
      }
    });
    const maxSingleTotal = Math.max(...Object.values(storeTotals.totals));
    const savings = Math.max(0, maxSingleTotal - totalCost);
    return { buckets, totalCost, savings };
  }, [detailedList, strategy, bestSingleStore, storeTotals]);

  const addItem = (productId) => {
    setShoppingList((prev) => {
      const existing = prev.find((i) => i.id === productId);
      const next = existing
        ? prev.map((i) => (i.id === productId ? { ...i, qty: i.qty + 1 } : i))
        : [...prev, { id: productId, qty: 1 }];
      persistState(next, plz, strategy);
      return next;
    });
  };

  const updateQty = (productId, delta) => {
    setShoppingList((prev) => {
      const next = prev
        .map((i) => (i.id === productId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0);
      persistState(next, plz, strategy);
      return next;
    });
  };

  const handlePlzSubmit = (e) => {
    e.preventDefault();
    if (/^\d{5}$/.test(plzInput.trim())) {
      const nextPlz = plzInput.trim();
      setPlz(nextPlz);
      persistState(shoppingList, nextPlz, strategy);
    }
  };

  const handleStrategyChange = (nextStrategy) => {
    setStrategy(nextStrategy);
    persistState(shoppingList, plz, nextStrategy);
  };

  const extensionPayload = useMemo(() => ({
    source: 'SmartCartDE',
    plz,
    timestamp: new Date().toISOString(),
    carts: {
      dm: {
        mode: dmDeliveryMode,
        items: activePlan.buckets.dm.map((i) => ({ dan: i.externalId, name: i.brandName || i.name, qty: i.qty, expectedPrice: i.chosenPrice })),
      },
      rewe: {
        mode: reweDeliveryMode,
        items: activePlan.buckets.rewe.map((i) => ({ productId: i.externalId, name: i.brandName || i.name, qty: i.qty, expectedPrice: i.chosenPrice })),
      },
    },
  }), [plz, dmDeliveryMode, reweDeliveryMode, activePlan]);

  const triggerExtensionCartFill = (store) => {
    setOrderFeedback((prev) => ({ ...prev, [store]: 'sending' }));
    window.postMessage({ type: 'SMARTCART_FILL_CART', store, payload: extensionPayload.carts[store], plz }, '*');
    if (!extensionInstalled) {
      setTimeout(() => {
        setOrderFeedback((prev) => ({ ...prev, [store]: 'Extension nicht erkannt – Nutze JSON-Export oder lade smartcart-bridge/' }));
      }, 800);
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(extensionPayload, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2500);
  };

  const toggleOfflineCheck = (key) => setCheckedOfflineItems((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-600 text-white p-2 rounded-xl shadow-sm">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg tracking-tight text-slate-900">SmartCart DE</h1>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {products.length} Artikel
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">REWE · dm · Lidl · {aldiRegion}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Globaler Glutenfrei-Filter */}
            <button
              onClick={() => setOnlyGlutenFree((v) => !v)}
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                onlyGlutenFree
                  ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
              }`}
            >
              <WheatOff className="w-3.5 h-3.5" />
              <span>{onlyGlutenFree ? 'Nur Glutenfrei: AN' : 'Glutenfrei filtern'}</span>
            </button>

            <button
              onClick={handleRefreshLivePrices}
              disabled={priceSyncState.running}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${priceSyncState.running ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Live-Preise</span>
            </button>

            <div className="hidden xl:flex items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border ${extensionInstalled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                <Chrome className="w-3.5 h-3.5" />
                {extensionInstalled ? 'Bridge aktiv' : 'Bridge bereit'}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                <Cloud className="w-3 h-3 text-emerald-600" />
                {syncStatus === 'offline' ? 'Lokal' : 'D1 Sync'}
              </span>
            </div>

            <form onSubmit={handlePlzSubmit} className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200">
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
              <input
                type="text"
                maxLength={5}
                value={plzInput}
                onChange={(e) => setPlzInput(e.target.value)}
                className="w-12 bg-transparent text-sm font-semibold text-slate-800 focus:outline-none"
                aria-label="Postleitzahl"
              />
              <button type="submit" className="text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 px-2 py-0.5 rounded-lg border border-slate-200">
                OK
              </button>
            </form>
          </div>
        </div>

        {priceSyncState.message && (
          <div className="bg-emerald-900 text-emerald-50 text-xs py-1.5 px-4 text-center flex items-center justify-center gap-2">
            <Clock className="w-3.5 h-3.5 text-emerald-300" />
            <span>{priceSyncState.message}</span>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Strategy & Savings Banner */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
          <div className="lg:col-span-8 bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Einkaufsstrategie wählen
              </span>
              <span className="text-xs text-slate-500">
                Region: <strong className="text-slate-700">{plz} ({aldiRegion})</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                onClick={() => handleStrategyChange('split')}
                className={`p-3 rounded-xl border text-left transition ${strategy === 'split' ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-slate-900">Smart Split</span>
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-xs text-slate-600">Bester Einzelpreis über alle 4 Händler.</p>
              </button>

              <button
                onClick={() => handleStrategyChange('single')}
                className={`p-3 rounded-xl border text-left transition ${strategy === 'single' ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-slate-900">1 Markt (Alles)</span>
                  <Store className="w-4 h-4 text-slate-500" />
                </div>
                <p className="text-xs text-slate-600">Günstigster Gesamtmarkt: <strong>{STORES[bestSingleStore.id]?.short}</strong></p>
              </button>

              <button
                onClick={() => handleStrategyChange('online_only')}
                className={`p-3 rounded-xl border text-left transition ${strategy === 'online_only' ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-slate-900">Nur Online</span>
                  <Truck className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-xs text-slate-600">Nur dm & REWE – komplett liefer-/abholbar.</p>
              </button>
            </div>
          </div>

          {/* Total & Checkout */}
          <div className="lg:col-span-4 bg-slate-900 text-white rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Optimierter Gesamtpreis ({shoppingList.reduce((a, b) => a + b.qty, 0)} Artikel)</span>
                {activePlan.savings > 0.05 && (
                  <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                    -{formatEur(activePlan.savings)} Ersparnis
                  </span>
                )}
              </div>
              <div className="text-3xl font-bold tracking-tight text-white mb-3">{formatEur(activePlan.totalCost)}</div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {Object.entries(activePlan.buckets).map(([storeId, items]) =>
                  items.length > 0 ? (
                    <span key={storeId} className={`text-xs font-semibold px-2 py-0.5 rounded-md ${STORES[storeId].color}`}>
                      {STORES[storeId].short}: {items.length}x
                    </span>
                  ) : null
                )}
              </div>
            </div>
            <button
              onClick={() => setCheckoutModalOpen(true)}
              disabled={detailedList.length === 0}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <span>Bestellung & Export starten</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main 2-Column Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Product Catalog */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-600" />
                  Katalog ({filteredCatalog.length})
                </h2>
                <button
                  onClick={() => setAddModalOpen(true)}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg flex items-center gap-1 border border-emerald-200 transition cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" /> Neues Produkt
                </button>
              </div>

              <div className="relative mb-3">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Katalog durchsuchen (z. B. Glutenfrei, Brot, Milch)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-lg whitespace-nowrap transition cursor-pointer ${
                      selectedCategory === cat ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {filteredCatalog.map((product) => {
                  const inCart = shoppingList.find((i) => i.id === product.id);
                  const validPrices = Object.entries(product.prices || {}).filter(([, d]) => d?.price !== null && d?.price !== undefined);
                  const minPriceObj = validPrices.length
                    ? validPrices.reduce((min, cur) => (cur[1].price < min[1].price ? cur : min), validPrices[0])
                    : null;

                  return (
                    <div key={product.id} className="p-3 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3 transition">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 truncate">{product.name}</span>
                          {product.isGlutenFree && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200 shrink-0">
                              <WheatOff className="w-2.5 h-2.5" /> GF
                            </span>
                          )}
                          {minPriceObj?.[1].promo && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
                              <Tag className="w-2.5 h-2.5" /> Deal
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>{product.unit}</span>
                          <span>·</span>
                          {minPriceObj && (
                            <span>ab <strong className="text-slate-700">{formatEur(minPriceObj[1].price)}</strong> ({STORES[minPriceObj[0]].short})</span>
                          )}
                        </div>
                      </div>

                      {inCart ? (
                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1 shrink-0">
                          <button onClick={() => updateQty(product.id, -1)} className="p-1 hover:bg-slate-100 rounded text-slate-600"><Minus className="w-3.5 h-3.5" /></button>
                          <span className="text-xs font-bold w-5 text-center">{inCart.qty}</span>
                          <button onClick={() => updateQty(product.id, 1)} className="p-1 hover:bg-slate-100 rounded text-slate-600"><Plus className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addItem(product.id)}
                          className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> In Liste
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Shopping List + Quick-Add + Saved Carts */}
          <div className="lg:col-span-7 space-y-4">
            {/* Gespeicherte Warenkörbe & Quick-Add Leiste */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <PlusCircle className="w-4 h-4 text-emerald-600" />
                  Einkaufsliste schnell erweitern
                </span>

                <button
                  onClick={() => setShowSavedCartsPanel((v) => !v)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Warenkörbe speichern / laden ({savedCarts.length})</span>
                </button>
              </div>

              {/* Quick-Add Suche direkt über der Einkaufsliste */}
              <div className="relative">
                <Search className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Artikel eintippen zum Hinzufügen (z. B. Glutenfreie Spaghetti, Milch, Brot)..."
                  value={quickAddQuery}
                  onChange={(e) => setQuickAddQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-emerald-50/40 border border-emerald-200 rounded-xl focus:outline-none focus:border-emerald-500"
                />
                {quickAddMatches.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {quickAddMatches.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          addItem(p.id);
                          setQuickAddQuery('');
                        }}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-emerald-50 flex items-center justify-between text-sm transition cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{p.name}</span>
                          <span className="text-xs text-slate-400">({p.unit})</span>
                          {p.isGlutenFree && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">GF</span>
                          )}
                        </span>
                        <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" /> Hinzufügen
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Aufklappbares Panel: Warenkörbe speichern & laden */}
              {showSavedCartsPanel && (
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <form onSubmit={handleSaveCurrentCart} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Name für aktuellen Warenkorb (z. B. Wocheneinkauf Glutenfrei)..."
                      value={saveCartName}
                      onChange={(e) => setSaveCartName(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={!saveCartName.trim() || shoppingList.length === 0}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <Bookmark className="w-3.5 h-3.5" /> Speichern
                    </button>
                  </form>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {savedCarts.length === 0 ? (
                      <p className="text-xs text-slate-400">Noch keine gespeicherten Warenkörbe vorhanden.</p>
                    ) : (
                      savedCarts.map((cart) => (
                        <div key={cart.id} className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
                          <div>
                            <div className="font-bold text-slate-800">{cart.name}</div>
                            <div className="text-[11px] text-slate-500">{cart.items.length} Positionen</div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleLoadSavedCart(cart.items, 'replace')}
                              className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold px-2.5 py-1 rounded-lg cursor-pointer"
                            >
                              Laden
                            </button>
                            <button
                              onClick={() => handleLoadSavedCart(cart.items, 'merge')}
                              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold px-2.5 py-1 rounded-lg cursor-pointer"
                            >
                              + Hinzufügen
                            </button>
                            <button
                              onClick={() => handleDeleteSavedCart(cart.id)}
                              className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                              title="Löschen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Preisvergleichs-Tabelle */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-base text-slate-900">
                  Deine Einkaufsliste ({detailedList.length} Positionen)
                </h2>
                <span className="text-xs text-slate-500">Grün = Aktive Zuweisung</span>
              </div>

              {detailedList.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">Deine Einkaufsliste ist leer. Nutze die Suche oben oder den Katalog links.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4">Artikel</th>
                        <th className="py-3 px-2 text-center">Menge</th>
                        <th className="py-3 px-3 text-right">dm</th>
                        <th className="py-3 px-3 text-right">REWE</th>
                        <th className="py-3 px-3 text-right">Lidl</th>
                        <th className="py-3 px-3 text-right">{aldiRegion}</th>
                        <th className="py-3 px-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {detailedList.map((item) => {
                        const assignedStoreId = Object.entries(activePlan.buckets).find(([, list]) =>
                          list.some((x) => x.id === item.id)
                        )?.[0];

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/50">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-900">{item.name}</span>
                                {item.isGlutenFree && (
                                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-900">GF</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400">{item.unit}</div>
                            </td>

                            <td className="py-3 px-2">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => updateQty(item.id, -1)} className="p-1 hover:bg-slate-200 rounded text-slate-500"><Minus className="w-3 h-3" /></button>
                                <span className="font-bold text-xs w-5 text-center">{item.qty}</span>
                                <button onClick={() => updateQty(item.id, 1)} className="p-1 hover:bg-slate-200 rounded text-slate-500"><Plus className="w-3 h-3" /></button>
                              </div>
                            </td>

                            {['dm', 'rewe', 'lidl', 'aldi'].map((storeId) => {
                              const info = item.prices?.[storeId];
                              const isAssigned = assignedStoreId === storeId;
                              if (!info || info.price === null || info.price === undefined) {
                                return <td key={storeId} className="py-3 px-3 text-right text-xs text-slate-300">n. v.</td>;
                              }
                              return (
                                <td key={storeId} className="py-3 px-3 text-right">
                                  <div className={`inline-flex flex-col items-end px-2 py-1 rounded-lg ${isAssigned ? 'bg-emerald-100 text-emerald-950 font-bold ring-1 ring-emerald-500/40' : 'text-slate-600'}`}>
                                    <span>{formatEur(info.price * item.qty)}</span>
                                    {info.promo && <span className="text-[9px] font-bold uppercase text-amber-700 leading-none mt-0.5">Angebot</span>}
                                  </div>
                                </td>
                              );
                            })}

                            <td className="py-3 px-2 text-right">
                              <button onClick={() => updateQty(item.id, -item.qty)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-200 font-bold text-xs text-slate-700">
                        <td className="py-3 px-4" colSpan={2}>Gesamtsumme (1 Markt)</td>
                        {['dm', 'rewe', 'lidl', 'aldi'].map((storeId) => (
                          <td key={storeId} className="py-3 px-3 text-right">
                            <div>{formatEur(storeTotals.totals[storeId])}</div>
                            {storeTotals.missing[storeId].length > 0 && (
                              <div className="text-[10px] font-normal text-amber-600">({storeTotals.missing[storeId].length} n. v.)</div>
                            )}
                          </td>
                        ))}
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Neues Produkt Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreateProduct} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-lg text-slate-900">Neues Lebensmittel anlegen</h3>
              <button type="button" onClick={() => setAddModalOpen(false)} className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">Abbrechen</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Produktname *</label>
                <input required type="text" placeholder="z. B. Schär Brot glutenfrei" value={newProd.name} onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kategorie</label>
                <select value={newProd.category} onChange={(e) => setNewProd({ ...newProd, category: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white">
                  {categories.filter((c) => c !== 'Alle').map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="Sonstiges">Sonstiges</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Packungsgröße</label>
                <input type="text" placeholder="z. B. 300 g" value={newProd.unit} onChange={(e) => setNewProd({ ...newProd, unit: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" />
              </div>
              <div className="col-span-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-amber-900 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200 cursor-pointer">
                  <input type="checkbox" checked={newProd.isGlutenFree} onChange={(e) => setNewProd({ ...newProd, isGlutenFree: e.target.checked })} className="rounded text-amber-600" />
                  <WheatOff className="w-3.5 h-3.5" />
                  <span>Als Glutenfrei (GF) markieren</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-red-700 mb-1">REWE Preis (€)</label>
                <input type="text" placeholder="2.49" value={newProd.rewePrice} onChange={(e) => setNewProd({ ...newProd, rewePrice: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-red-700 mb-1">REWE Product-ID</label>
                <input type="text" placeholder="z. B. 7901001" value={newProd.reweId} onChange={(e) => setNewProd({ ...newProd, reweId: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-blue-900 mb-1">dm Preis (€)</label>
                <input type="text" placeholder="leer = n. v." value={newProd.dmPrice} onChange={(e) => setNewProd({ ...newProd, dmPrice: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-blue-900 mb-1">dm DAN-Nummer</label>
                <input type="text" placeholder="z. B. 519201" value={newProd.dmDan} onChange={(e) => setNewProd({ ...newProd, dmDan: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-amber-800 mb-1">Lidl Preis (€)</label>
                <input type="text" placeholder="2.29" value={newProd.lidlPrice} onChange={(e) => setNewProd({ ...newProd, lidlPrice: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-sky-800 mb-1">Aldi Preis (€)</label>
                <input type="text" placeholder="2.29" value={newProd.aldiPrice} onChange={(e) => setNewProd({ ...newProd, aldiPrice: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
              </div>
            </div>

            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-sm transition cursor-pointer">
              Produkt in D1-Datenbank speichern
            </button>
          </form>
        </div>
      )}

      {/* Checkout Modal */}
      {checkoutModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Bestellung & Einkaufszettel ausführen</h3>
                <p className="text-xs text-slate-500">Warenkorb-Übergabe via Chrome-Bridge (dm & REWE) + Einkaufszettel (Aldi & Lidl)</p>
              </div>
              <button onClick={() => setCheckoutModalOpen(false)} className="text-sm font-semibold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg bg-slate-100">Schließen</button>
            </div>

            <div className="p-5 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* dm */}
                <div className="border border-blue-200 bg-blue-50/30 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-blue-950 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-900"></span>dm-drogerie Online</span>
                      <span className="text-xs font-bold bg-blue-900 text-white px-2 py-0.5 rounded">{activePlan.buckets.dm.length} Artikel</span>
                    </div>
                    {activePlan.buckets.dm.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">Keine Artikel für dm eingeplant.</p>
                    ) : (
                      <>
                        <div className="flex gap-2 mb-3">
                          <button onClick={() => setDmDeliveryMode('express')} className={`flex-1 text-xs py-1.5 px-2 rounded-lg border font-medium ${dmDeliveryMode === 'express' ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-700 border-slate-200'}`}>Express-Abholung ({plz})</button>
                          <button onClick={() => setDmDeliveryMode('shipping')} className={`flex-1 text-xs py-1.5 px-2 rounded-lg border font-medium ${dmDeliveryMode === 'shipping' ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-700 border-slate-200'}`}>Paketversand</button>
                        </div>
                        <ul className="space-y-1.5 text-xs mb-4 max-h-40 overflow-y-auto">
                          {activePlan.buckets.dm.map((item) => (
                            <li key={item.id} className="flex justify-between bg-white p-2 rounded border border-blue-100">
                              <span><strong>{item.qty}x</strong> {item.brandName || item.name}</span>
                              <span className="font-semibold">{formatEur(item.lineTotal)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                  {activePlan.buckets.dm.length > 0 && (
                    <div>
                      <button onClick={() => triggerExtensionCartFill('dm')} className="w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition bg-blue-900 hover:bg-blue-800 text-white cursor-pointer">
                        <ExternalLink className="w-3.5 h-3.5" /><span>dm-Warenkorb in Chrome füllen</span>
                      </button>
                      {orderFeedback.dm && orderFeedback.dm !== 'sending' && <p className="text-[11px] text-blue-900 font-medium mt-1.5 text-center">{orderFeedback.dm}</p>}
                    </div>
                  )}
                </div>

                {/* REWE */}
                <div className="border border-red-200 bg-red-50/30 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-red-950 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>REWE Online-Shop</span>
                      <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded">{activePlan.buckets.rewe.length} Artikel</span>
                    </div>
                    {activePlan.buckets.rewe.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">Keine Artikel für REWE eingeplant.</p>
                    ) : (
                      <>
                        <div className="flex gap-2 mb-3">
                          <button onClick={() => setReweDeliveryMode('pickup')} className={`flex-1 text-xs py-1.5 px-2 rounded-lg border font-medium ${reweDeliveryMode === 'pickup' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-700 border-slate-200'}`}>Abholservice ({plz})</button>
                          <button onClick={() => setReweDeliveryMode('delivery')} className={`flex-1 text-xs py-1.5 px-2 rounded-lg border font-medium ${reweDeliveryMode === 'delivery' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-700 border-slate-200'}`}>Lieferservice</button>
                        </div>
                        <ul className="space-y-1.5 text-xs mb-4 max-h-40 overflow-y-auto">
                          {activePlan.buckets.rewe.map((item) => (
                            <li key={item.id} className="flex justify-between bg-white p-2 rounded border border-red-100">
                              <span><strong>{item.qty}x</strong> {item.brandName || item.name}</span>
                              <span className="font-semibold">{formatEur(item.lineTotal)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                  {activePlan.buckets.rewe.length > 0 && (
                    <div>
                      <button onClick={() => triggerExtensionCartFill('rewe')} className="w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition bg-red-600 hover:bg-red-700 text-white cursor-pointer">
                        <ExternalLink className="w-3.5 h-3.5" /><span>REWE-Warenkorb in Chrome füllen</span>
                      </button>
                      {orderFeedback.rewe && orderFeedback.rewe !== 'sending' && <p className="text-[11px] text-red-900 font-medium mt-1.5 text-center">{orderFeedback.rewe}</p>}
                    </div>
                  )}
                </div>
              </div>

              {(activePlan.buckets.lidl.length > 0 || activePlan.buckets.aldi.length > 0) && (
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                  <h4 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-slate-700" />Einkaufszettel für die Filiale (Aldi & Lidl)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {['lidl', 'aldi'].map((storeId) => {
                      const items = activePlan.buckets[storeId];
                      if (items.length === 0) return null;
                      return (
                        <div key={storeId} className="bg-white p-3 rounded-xl border border-slate-200">
                          <div className="font-bold text-xs uppercase tracking-wider text-slate-700 mb-2">{storeId === 'aldi' ? aldiRegion : 'Lidl Filiale'} ({items.length})</div>
                          <ul className="space-y-1.5">
                            {items.map((item) => {
                              const checkKey = `${storeId}-${item.id}`;
                              const checked = !!checkedOfflineItems[checkKey];
                              return (
                                <li key={item.id} onClick={() => toggleOfflineCheck(checkKey)} className={`flex items-center justify-between text-xs p-2 rounded-lg border cursor-pointer transition ${checked ? 'bg-slate-50 border-slate-100 text-slate-400 line-through' : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'}`}>
                                  <span className="flex items-center gap-2"><input type="checkbox" checked={checked} readOnly className="rounded text-emerald-600" /><span><strong>{item.qty}x</strong> {item.brandName || item.name}</span></span>
                                  <span className="font-semibold">{formatEur(item.lineTotal)}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-900 text-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-emerald-400" />Cart-Bridge JSON-Payload</span>
                  <button onClick={handleCopyJson} className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-slate-700">
                    {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedJson ? 'Kopiert!' : 'JSON kopieren'}
                  </button>
                </div>
                <pre className="text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-32">{JSON.stringify(extensionPayload, null, 2)}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
