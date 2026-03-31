
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  GenerationMode, 
  ImageSize, 
  AssetOption, 
  MenuText, 
  DesignConcept,
  Job 
} from './types';
import { generateFoodImage, generateDesignConcepts } from './services/geminiService';
import MenuCanvas from './components/MenuCanvas';

const App = () => {
  const [mode, setMode] = useState<GenerationMode>(GenerationMode.MENU);
  const [size, setSize] = useState<ImageSize>(ImageSize.SQUARE);
  const [assetOption, setAssetOption] = useState<AssetOption>(AssetOption.PRO);
  const [menuText, setMenuText] = useState<MenuText>({ title: '', subtitle: '', price: '' });
  const [customInstructions, setCustomInstructions] = useState('');
  const [refinementInstructions, setRefinementInstructions] = useState('');
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  
  // デザインコンセプト
  const [concepts, setConcepts] = useState<DesignConcept[]>([]);
  const [selectedConcept, setSelectedConcept] = useState<DesignConcept | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 状態管理
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<Job[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKeySetup, setShowApiKeySetup] = useState(false);
  
  const [showOriginal, setShowOriginal] = useState(false);

  // 履歴保存の重複防止用
  const savedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const savedHistory = localStorage.getItem('foodgen_history_pro_v7');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        setHistory(parsed);
        parsed.forEach((item: Job) => savedIdsRef.current.add(item.id));
      } catch (e) {
        console.error("History parse error", e);
      }
    }

    const savedKey = localStorage.getItem('foodgen_gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setHasApiKey(true);
    } else {
      setShowApiKeySetup(true);
    }
  }, []);

  const handleSaveApiKey = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    localStorage.setItem('foodgen_gemini_api_key', trimmed);
    setApiKey(trimmed);
    setHasApiKey(true);
    setShowApiKeySetup(false);
    setApiKeyInput('');
  };

  const handleResetApiKey = () => {
    localStorage.removeItem('foodgen_gemini_api_key');
    setApiKey('');
    setHasApiKey(false);
    setShowApiKeySetup(true);
  };

  const saveToHistory = useCallback((job: Job) => {
    if (!job.finalImageUrl || job.finalImageUrl.includes('undefined')) return;
    
    setHistory(prev => {
      if (savedIdsRef.current.has(job.id)) return prev;
      
      const newHistory = [job, ...prev].slice(0, 30);
      return newHistory;
    });

    // Move side effects out of state updater
    if (!savedIdsRef.current.has(job.id)) {
      savedIdsRef.current.add(job.id);
      const savedHistory = localStorage.getItem('foodgen_history_pro_v7');
      let historyArray = [];
      if (savedHistory) {
        try {
          historyArray = JSON.parse(savedHistory);
        } catch (e) {}
      }
      const newHistory = [job, ...historyArray].slice(0, 30);
      localStorage.setItem('foodgen_history_pro_v7', JSON.stringify(newHistory));
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setOriginalImage(reader.result as string);
        setConcepts([]);
        setSelectedConcept(null);
        setError(null);
        setCurrentJob(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGetDesignIdeas = async () => {
    if (!originalImage) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const ideas = await generateDesignConcepts(originalImage, apiKey);
      if (ideas && ideas.length > 0) {
        setConcepts(ideas);
        setSelectedConcept(ideas[0]);
      } else {
        throw new Error("デザイン案の生成に失敗しました。");
      }
    } catch (err: any) {
      setError(err.message || "AI分析中にエラーが発生しました。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerate = async (isRefining: boolean = false) => {
    if (!apiKey) {
      setShowApiKeySetup(true);
      return;
    }

    // 修正（リファインメント）の場合は生成済みの画像をベースにし、そうでない場合はオリジナル画像を使用
    const baseImage = isRefining && currentJob ? currentJob.generatedImageUrl : originalImage;
    if (!baseImage) return;

    if (mode === GenerationMode.MENU && !selectedConcept) {
      setError("デザインアイデアを選択してください。");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setShowOriginal(false);
    
    const instructions = isRefining ? refinementInstructions : customInstructions;

    try {
      const generatedUrl = await generateFoodImage(
        baseImage,
        mode,
        size,
        apiKey,
        assetOption,
        selectedConcept || undefined,
        instructions
      );

      const jobId = Math.random().toString(36).substr(2, 9);
      const newJob: Job = {
        id: jobId,
        timestamp: Date.now(),
        mode,
        size,
        originalImageUrl: originalImage!,
        generatedImageUrl: generatedUrl,
        finalImageUrl: generatedUrl,
        text: mode === GenerationMode.MENU ? { ...menuText } : undefined,
        concept: selectedConcept || undefined,
      };

      setCurrentJob(newJob);
      setRefinementInstructions(''); // 修正指示をリセット
      
      if (mode === GenerationMode.ASSET) {
        saveToHistory(newJob);
      }
    } catch (err: any) {
      console.error("Generation failed:", err);
      if (err.message === "KEY_RESET_REQUIRED") {
        handleResetApiKey();
        setError("APIキーが有効ではありません。キー設定を確認してください。");
      } else {
        setError(err.message || "生成に失敗しました。時間をおいて再度お試しください。");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (currentJob && currentJob.mode === GenerationMode.MENU && currentJob.finalImageUrl && !currentJob.finalImageUrl.includes('undefined')) {
      saveToHistory(currentJob);
    }
  }, [currentJob?.id, currentJob?.finalImageUrl, saveToHistory]);

  const handleFinalizeMenu = useCallback((finalUrl: string) => {
    if (!finalUrl || finalUrl.includes('undefined')) return;
    
    setCurrentJob(prev => {
      if (prev && prev.mode === GenerationMode.MENU && prev.finalImageUrl !== finalUrl) {
        return { ...prev, finalImageUrl: finalUrl };
      }
      return prev;
    });
  }, []);

  const resetProject = () => {
    setCurrentJob(null);
    setOriginalImage(null);
    setConcepts([]);
    setSelectedConcept(null);
    setMenuText({ title: '', subtitle: '', price: '' });
    setError(null);
    setCustomInstructions('');
    setRefinementInstructions('');
    setShowOriginal(false);
  };

  const downloadImage = () => {
    if (!currentJob?.finalImageUrl) return;
    const link = document.createElement('a');
    link.href = currentJob.finalImageUrl;
    link.download = `foodgen_${currentJob.mode.toLowerCase()}_${currentJob.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-slate-900 overflow-x-hidden">
      {/* APIキー入力モーダル */}
      {showApiKeySetup && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center px-8">
          <div className="w-full max-w-md space-y-10">
            <div>
              <h2 className="text-2xl font-light tracking-tighter text-slate-900">
                FOODGEN <span className="font-bold">PRO</span>
              </h2>
              <p className="text-[9px] tracking-[0.3em] text-slate-400 mt-1 uppercase font-bold">API Key Setup</p>
            </div>
            <div className="space-y-4">
              <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Gemini APIキーを入力してください</p>
              <input
                type="password"
                placeholder="AIza..."
                className="w-full bg-slate-50 border-none px-5 py-4 text-sm outline-none font-mono"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
                autoFocus
              />
              <p className="text-[9px] text-slate-300 font-medium">
                キーは端末のlocalStorageに保存されます。外部には送信されません。
              </p>
            </div>
            <button
              onClick={handleSaveApiKey}
              disabled={!apiKeyInput.trim()}
              className="w-full py-6 bg-slate-900 text-white text-[10px] font-black tracking-[0.4em] uppercase disabled:opacity-20 hover:bg-slate-800 transition"
            >
              保存して開始
            </button>
          </div>
        </div>
      )}

      {/* ローディングオーバーレイ */}
      {(isGenerating || isAnalyzing) && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="w-10 h-10 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-8" />
          <p className="text-[10px] font-black tracking-[0.5em] text-slate-900 uppercase">
            {isAnalyzing ? "DESIGN ANALYSIS" : "GENERATING MASTERPIECE"}
          </p>
          <p className="mt-4 text-[9px] text-slate-400 font-bold uppercase tracking-widest">
            Please wait while AI creates high-end visuals.
          </p>
        </div>
      )}

      {/* ヘッダー */}
      <header className="px-8 py-8 max-w-7xl mx-auto w-full flex justify-between items-center border-b border-slate-50">
        <div className="cursor-pointer group" onClick={resetProject}>
          <h1 className="text-2xl font-light tracking-tighter text-slate-900 flex items-center gap-2">
            FOODGEN <span className="font-bold">PRO</span>
          </h1>
          <p className="text-[9px] tracking-[0.3em] text-slate-400 mt-0.5 uppercase font-bold">Design Intelligence</p>
        </div>
        <div className="flex gap-8 text-[10px] font-black tracking-widest uppercase">
          <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} className="text-slate-400 hover:text-slate-900 transition">アーカイブ</button>
          <button onClick={handleResetApiKey} className="text-slate-400 hover:text-slate-900 transition">APIキー</button>
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-slate-400 hover:text-slate-900 transition underline underline-offset-4">利用規約</a>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-8 py-12">
        {!currentJob ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start animate-fade-in">
            {/* 設定セクション */}
            <div className="lg:col-span-5 space-y-12">
              <section>
                <div className="flex gap-1 mb-10 border-b border-slate-100">
                  <button 
                    onClick={() => setMode(GenerationMode.MENU)}
                    className={`flex-1 py-4 text-[11px] font-black tracking-widest uppercase transition-all duration-300 border-b-2 ${mode === GenerationMode.MENU ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-300 hover:text-slate-400'}`}
                  >
                    メニュー・告知用
                  </button>
                  <button 
                    onClick={() => setMode(GenerationMode.ASSET)}
                    className={`flex-1 py-4 text-[11px] font-black tracking-widest uppercase transition-all duration-300 border-b-2 ${mode === GenerationMode.ASSET ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-300 hover:text-slate-400'}`}
                  >
                    写真素材
                  </button>
                </div>

                <div className="relative group border border-dashed border-slate-200 rounded-sm aspect-video flex items-center justify-center bg-slate-50/50 hover:bg-slate-50 hover:border-slate-400 transition-all duration-500 overflow-hidden cursor-pointer">
                  {originalImage ? (
                    <img src={originalImage} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" alt="Upload preview" />
                  ) : (
                    <div className="text-center px-10">
                      <p className="text-[10px] font-black tracking-[0.3em] uppercase text-slate-300">画像をアップロード</p>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              </section>

              {originalImage && mode === GenerationMode.MENU && (
                <section className="space-y-8 animate-fade-in">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        type="text" placeholder="商品名"
                        className="bg-slate-50 border-none px-5 py-4 text-[11px] font-bold tracking-widest outline-none transition uppercase placeholder:text-slate-300"
                        value={menuText.title} onChange={e => setMenuText({...menuText, title: e.target.value})}
                      />
                      <input 
                        type="text" placeholder="価格"
                        className="bg-slate-50 border-none px-5 py-4 text-[11px] font-bold tracking-widest outline-none transition uppercase placeholder:text-slate-300"
                        value={menuText.price} onChange={e => setMenuText({...menuText, price: e.target.value})}
                      />
                    </div>
                    <input 
                      type="text" placeholder="サブコピー"
                      className="w-full bg-slate-50 border-none px-5 py-4 text-[11px] font-bold tracking-widest outline-none transition uppercase placeholder:text-slate-300"
                      value={menuText.subtitle} onChange={e => setMenuText({...menuText, subtitle: e.target.value})}
                    />
                    <textarea 
                      placeholder="補足指示（例：季節感を出す、背景を明るくする等）"
                      className="w-full bg-slate-50 border-none px-5 py-4 text-[11px] font-bold tracking-widest outline-none transition uppercase placeholder:text-slate-300 resize-none h-24"
                      value={customInstructions} onChange={e => setCustomInstructions(e.target.value)}
                    />
                  </div>

                  {concepts.length === 0 ? (
                    <button 
                      onClick={handleGetDesignIdeas}
                      disabled={isAnalyzing}
                      className="w-full py-6 bg-slate-900 text-white text-[10px] font-black tracking-[0.4em] uppercase hover:bg-slate-800 transition"
                    >
                      プロデザイナーのアイデアを提案
                    </button>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">コンセプト選択</p>
                        <button onClick={handleGetDesignIdeas} className="text-[9px] font-bold text-slate-300 hover:text-slate-900 transition underline">再提案</button>
                      </div>
                      <div className="flex flex-col gap-4">
                        {concepts.map(c => (
                          <button 
                            key={c.id}
                            onClick={() => setSelectedConcept(c)}
                            className={`text-left p-6 border transition-all duration-500 ${selectedConcept?.id === c.id ? 'bg-slate-900 border-slate-900 text-white shadow-xl' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300 hover:bg-slate-50'}`}
                          >
                            <span className="text-[11px] font-black tracking-[0.2em] uppercase block mb-1">{c.label}</span>
                            <p className="text-[10px] opacity-60 font-medium tracking-wide leading-relaxed">{c.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {originalImage && mode === GenerationMode.ASSET && (
                <section className="space-y-6 animate-fade-in">
                  <div className="space-y-6">
                    <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">スタイル</p>
                    <div className="flex gap-3">
                      <button onClick={() => setAssetOption(AssetOption.PRO)} className={`flex-1 py-5 text-[10px] font-black border tracking-widest transition-all ${assetOption === AssetOption.PRO ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'border-slate-100 text-slate-300 hover:border-slate-200'}`}>
                        エディトリアル
                      </button>
                      <button onClick={() => setAssetOption(AssetOption.SIZZLE)} className={`flex-1 py-5 text-[10px] font-black border tracking-widest transition-all ${assetOption === AssetOption.SIZZLE ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'border-slate-100 text-slate-300 hover:border-slate-200'}`}>
                        シズル感
                      </button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">追加の指示</p>
                    <textarea 
                      placeholder="例：背景を木目調にする、自然光を強調する等"
                      className="w-full bg-slate-50 border-none px-5 py-4 text-[11px] font-bold tracking-widest outline-none transition uppercase placeholder:text-slate-300 resize-none h-24"
                      value={customInstructions} onChange={e => setCustomInstructions(e.target.value)}
                    />
                  </div>
                </section>
              )}

              {originalImage && (
                <div className="pt-12 border-t border-slate-50">
                  <div className="flex justify-between items-center mb-6">
                    <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">サイズ</p>
                    <div className="flex flex-wrap gap-2 justify-end">
                      {[ImageSize.SQUARE, ImageSize.MOBILE_4_3, ImageSize.FLYER, ImageSize.FLYER_LONG, ImageSize.FLYER_1_1_4].map(s => (
                        <button key={s} onClick={() => setSize(s)} className={`px-3 py-2 text-[10px] font-bold border transition-all ${size === s ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-300 border-slate-100 hover:border-slate-200'}`}>
                          {s === ImageSize.SQUARE ? '1:1' : s === ImageSize.MOBILE_4_3 ? '4:3' : s === ImageSize.FLYER ? '3:4' : s === ImageSize.FLYER_LONG ? '7:10' : '1:1.4'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleGenerate(false)}
                    disabled={isGenerating || (mode === GenerationMode.MENU && !selectedConcept)}
                    className="w-full py-8 bg-slate-900 text-white text-xs font-black tracking-[0.5em] uppercase disabled:opacity-20 hover:bg-slate-800 transition-all shadow-2xl active:scale-95"
                  >
                    生成を開始
                  </button>
                  {error && <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded text-center">
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">{error}</p>
                  </div>}
                </div>
              )}
            </div>

            {/* 空のプレビュー */}
            <div className="lg:col-span-7 flex flex-col items-center justify-center opacity-[0.03] py-20">
               <div className="w-px h-32 bg-slate-900 mb-8" />
               <p className="text-[11px] font-black tracking-[1em] uppercase">Visual Hub</p>
            </div>
          </div>
        ) : (
          /* 結果表示セクション */
          <div className="animate-fade-in space-y-20">
            <div className="flex flex-col lg:grid lg:grid-cols-12 gap-20 items-start">
              <div className="lg:col-span-8 space-y-10 w-full">
                <div className="flex justify-between items-end border-b border-slate-50 pb-6">
                  <div>
                    <h2 className="text-[11px] font-black tracking-[0.3em] uppercase text-slate-900">OUTPUT ARCHIVE</h2>
                    <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest mt-1">Generated Visual Asset</p>
                  </div>
                  <div className="flex gap-6 text-[10px] font-black uppercase tracking-[0.2em]">
                    <button onClick={() => setShowOriginal(true)} className={`transition ${showOriginal ? 'text-slate-900' : 'text-slate-200'}`}>元画像</button>
                    <button onClick={() => setShowOriginal(false)} className={`transition ${!showOriginal ? 'text-slate-900' : 'text-slate-200'}`}>生成後</button>
                  </div>
                </div>

                <div className="relative bg-slate-50 flex items-center justify-center min-h-[500px] shadow-2xl rounded-sm overflow-hidden">
                   {showOriginal ? (
                     <img src={currentJob.originalImageUrl} className="max-w-full max-h-[80vh] object-contain animate-fade-in" alt="Original" />
                   ) : (
                     currentJob.mode === GenerationMode.MENU && currentJob.concept ? (
                        <MenuCanvas 
                          imageUrl={currentJob.generatedImageUrl}
                          text={currentJob.text!}
                          concept={currentJob.concept!}
                          size={currentJob.size}
                          onExport={handleFinalizeMenu}
                        />
                     ) : (
                       <img src={currentJob.generatedImageUrl} className="max-w-full max-h-[80vh] object-contain animate-fade-in" alt="Generated" />
                     )
                   )}
                </div>
              </div>

              <div className="lg:col-span-4 space-y-12 w-full">
                {/* 修正・調整用セクション */}
                <div className="space-y-6 bg-slate-50/50 p-8 rounded-sm">
                  <p className="text-[10px] font-black tracking-widest text-slate-900 uppercase">デザインの修正・微調整</p>
                  <textarea 
                    placeholder="例：もっと背景を暗くして、料理を左にもっと寄せて、など具体的な修正指示を入力"
                    className="w-full bg-white border border-slate-100 px-5 py-4 text-[11px] font-medium tracking-wide outline-none transition placeholder:text-slate-300 resize-none h-32 focus:border-slate-900"
                    value={refinementInstructions} onChange={e => setRefinementInstructions(e.target.value)}
                  />
                  <button 
                    onClick={() => handleGenerate(true)}
                    disabled={isGenerating || !refinementInstructions.trim()}
                    className="w-full py-5 bg-white border border-slate-900 text-slate-900 text-[9px] font-black tracking-[0.4em] uppercase hover:bg-slate-900 hover:text-white transition shadow-sm disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-900"
                  >
                    この指示で修正する
                  </button>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-50">
                  <button onClick={downloadImage} className="w-full py-6 bg-slate-900 text-white text-[10px] font-black tracking-[0.4em] uppercase hover:bg-slate-800 transition shadow-xl active:scale-95">ダウンロード</button>
                  <button onClick={resetProject} className="w-full py-6 border border-slate-100 text-[10px] font-black tracking-[0.4em] uppercase hover:border-slate-900 transition active:scale-95">新規作成</button>
                  <button 
                    onClick={() => handleGenerate(false)} 
                    className="w-full py-6 text-slate-400 hover:text-slate-900 text-[9px] font-black tracking-[0.4em] uppercase transition underline underline-offset-8"
                  >
                    最初から再生成
                  </button>
                </div>
                {error && <p className="text-[9px] font-black text-red-500 uppercase tracking-widest text-center">{error}</p>}
              </div>
            </div>
          </div>
        )}

        {/* 履歴 */}
        {history.length > 0 && (
          <section className="mt-40 pt-20 border-t border-slate-50">
             <h3 className="text-[10px] font-black tracking-[0.5em] uppercase text-slate-200 mb-16 text-center">Archive</h3>
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-10">
               {history.map((job) => (
                 <div key={`${job.id}-${job.timestamp}`} onClick={() => {setCurrentJob(job); window.scrollTo({top: 0, behavior: 'smooth'})}} className="group cursor-pointer space-y-4">
                    <div className="aspect-square bg-slate-50 overflow-hidden relative border border-slate-50 shadow-sm transition-all group-hover:shadow-xl">
                      <img src={job.finalImageUrl} className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700" alt={`Archive ${job.id}`} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] truncate text-slate-400 group-hover:text-slate-900 transition-colors">{job.text?.title || 'PHOTO ASSET'}</p>
                    </div>
                 </div>
               ))}
             </div>
          </section>
        )}
      </main>

      <footer className="py-20 border-t border-slate-50 mt-40 text-center">
        <p className="text-[9px] font-bold tracking-[0.6em] text-slate-200 uppercase">&copy; 2024 FOODGEN PRO</p>
      </footer>

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        ::selection { background: #000; color: #fff; }
      `}</style>
    </div>
  );
};

export default App;
