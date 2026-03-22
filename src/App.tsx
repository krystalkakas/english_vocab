import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  Timestamp, 
  updateDoc, 
  doc, 
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  Plus, 
  Search, 
  Trash2, 
  Volume2, 
  Table as TableIcon, 
  GraduationCap, 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  LogOut,
  User as UserIcon,
  Loader2,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, isWithinInterval, subDays } from 'date-fns';
import { db, auth } from './firebase';
import { Word, OperationType, FirestoreErrorInfo } from './types';
import { generateWordDetails, generatePronunciation } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Error handling as per guidelines
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId || undefined,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName || '',
        email: provider.email || '',
        photoUrl: provider.photoURL || ''
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [view, setView] = useState<'sheet' | 'quiz'>('sheet');
  const [filter, setFilter] = useState<'all' | 'day' | 'week'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore connection test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  // Data fetching
  useEffect(() => {
    if (!user || !isAuthReady) {
      setWords([]);
      return;
    }

    const q = query(
      collection(db, 'words'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const wordsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Word[];
      setWords(wordsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'words');
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleAddWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.trim() || !user) return;

    setLoading(true);
    try {
      const details = await generateWordDetails(newWord);
      const audioUrl = await generatePronunciation(newWord);
      
      const wordData: Omit<Word, 'id'> = {
        word: newWord.trim(),
        ...details,
        audioUrl: audioUrl || undefined,
        userId: user.uid,
        createdAt: Timestamp.now(),
        masteryLevel: 0
      };

      await addDoc(collection(db, 'words'), wordData);
      setNewWord('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'words');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWord = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'words', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `words/${id}`);
    }
  };

  const playAudio = (url: string) => {
    const audio = new Audio(url);
    audio.play();
  };

  const filteredWords = useMemo(() => {
    let result = words;
    const now = new Date();

    if (filter === 'day') {
      result = result.filter(w => {
        const date = w.createdAt.toDate();
        return isWithinInterval(date, { start: startOfDay(now), end: endOfDay(now) });
      });
    } else if (filter === 'week') {
      result = result.filter(w => {
        const date = w.createdAt.toDate();
        return isWithinInterval(date, { start: startOfWeek(now), end: endOfWeek(now) });
      });
    }

    if (searchQuery) {
      result = result.filter(w => 
        w.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.translation.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return result;
  }, [words, filter, searchQuery]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0]">
        <Loader2 className="w-8 h-8 animate-spin text-[#5A5A40]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F0] p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-8 rounded-[32px] shadow-xl text-center"
        >
          <div className="w-16 h-16 bg-[#5A5A40] rounded-2xl flex items-center justify-center mx-auto mb-6">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-[#1A1A1A] mb-2">English Vocab Master</h1>
          <p className="text-[#5A5A40] mb-8">Học từ vựng thông minh với sự hỗ trợ của AI.</p>
          <button
            onClick={handleLogin}
            className="w-full bg-[#5A5A40] text-white py-4 rounded-full font-medium flex items-center justify-center gap-3 hover:bg-[#4A4A30] transition-colors"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Đăng nhập với Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#1A1A1A] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E5E0] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-[#5A5A40]" />
            <span className="font-serif font-bold text-xl">Vocab Master</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#F5F5F0] rounded-full">
              <img src={user.photoURL || ''} className="w-6 h-6 rounded-full" alt={user.displayName || ''} />
              <span className="text-sm font-medium">{user.displayName}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-[#5A5A40] hover:bg-[#F5F5F0] rounded-full transition-colors"
              title="Đăng xuất"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Top Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Add Word Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleAddWord} className="relative">
              <input
                type="text"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder="Nhập từ vựng tiếng Anh mới..."
                className="w-full h-16 pl-6 pr-16 bg-white rounded-[24px] shadow-sm border-none focus:ring-2 focus:ring-[#5A5A40] text-lg"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !newWord.trim()}
                className="absolute right-3 top-3 w-10 h-10 bg-[#5A5A40] text-white rounded-full flex items-center justify-center hover:bg-[#4A4A30] transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-6 h-6" />}
              </button>
            </form>
          </div>

          {/* View Toggle */}
          <div className="flex bg-white p-1.5 rounded-full shadow-sm">
            <button
              onClick={() => setView('sheet')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all",
                view === 'sheet' ? "bg-[#5A5A40] text-white" : "text-[#5A5A40] hover:bg-[#F5F5F0]"
              )}
            >
              <TableIcon className="w-4 h-4" />
              <span>Bảng từ</span>
            </button>
            <button
              onClick={() => setView('quiz')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all",
                view === 'quiz' ? "bg-[#5A5A40] text-white" : "text-[#5A5A40] hover:bg-[#F5F5F0]"
              )}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Kiểm tra</span>
            </button>
          </div>
        </div>

        {view === 'sheet' ? (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 bg-white p-1 rounded-full shadow-sm">
                {(['all', 'day', 'week'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                      filter === f ? "bg-[#5A5A40] text-white" : "text-[#5A5A40] hover:bg-[#F5F5F0]"
                    )}
                  >
                    {f === 'all' ? 'Tất cả' : f === 'day' ? 'Hôm nay' : 'Tuần này'}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A5A40] opacity-50" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm từ vựng..."
                  className="w-full pl-10 pr-4 py-2 bg-white rounded-full border-none shadow-sm focus:ring-2 focus:ring-[#5A5A40] text-sm"
                />
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-[32px] shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#5A5A40] text-white">
                      <th className="px-6 py-4 font-serif font-medium text-sm uppercase tracking-wider">Từ vựng</th>
                      <th className="px-6 py-4 font-serif font-medium text-sm uppercase tracking-wider">Phiên âm</th>
                      <th className="px-6 py-4 font-serif font-medium text-sm uppercase tracking-wider">Từ loại</th>
                      <th className="px-6 py-4 font-serif font-medium text-sm uppercase tracking-wider">Dịch nghĩa</th>
                      <th className="px-6 py-4 font-serif font-medium text-sm uppercase tracking-wider">Ví dụ</th>
                      <th className="px-6 py-4 font-serif font-medium text-sm uppercase tracking-wider">Phát âm</th>
                      <th className="px-6 py-4 font-serif font-medium text-sm uppercase tracking-wider">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E0]">
                    <AnimatePresence mode="popLayout">
                      {filteredWords.map((word) => (
                        <motion.tr 
                          key={word.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="hover:bg-[#F5F5F0] transition-colors group"
                        >
                          <td className="px-6 py-4 font-bold text-[#5A5A40]">{word.word}</td>
                          <td className="px-6 py-4 text-sm text-[#5A5A40] opacity-70">{word.phonetic}</td>
                          <td className="px-6 py-4 text-sm">
                            <span className="px-2 py-1 bg-[#F5F5F0] rounded-md text-[10px] uppercase font-bold text-[#5A5A40]">
                              {word.partOfSpeech}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium">{word.translation}</td>
                          <td className="px-6 py-4 text-sm italic text-[#5A5A40] max-w-xs">{word.example}</td>
                          <td className="px-6 py-4">
                            {word.audioUrl && (
                              <button 
                                onClick={() => playAudio(word.audioUrl!)}
                                className="p-2 text-[#5A5A40] hover:bg-[#5A5A40] hover:text-white rounded-full transition-all"
                              >
                                <Volume2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => word.id && handleDeleteWord(word.id)}
                              className="p-2 text-red-400 hover:bg-red-50 rounded-full transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
              {filteredWords.length === 0 && (
                <div className="py-20 text-center text-[#5A5A40] opacity-50">
                  <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>Chưa có từ vựng nào trong danh sách này.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <Quiz words={words} onComplete={() => setView('sheet')} />
        )}
      </main>
    </div>
  );
}

function Quiz({ words, onComplete }: { words: Word[], onComplete: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState<'correct' | 'wrong' | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const quizWords = useMemo(() => {
    return [...words].sort(() => Math.random() - 0.5).slice(0, 10);
  }, [words]);

  if (quizWords.length === 0) {
    return (
      <div className="bg-white p-12 rounded-[32px] text-center shadow-sm">
        <p className="text-[#5A5A40] mb-6">Bạn cần ít nhất một từ vựng để bắt đầu kiểm tra.</p>
        <button onClick={onComplete} className="bg-[#5A5A40] text-white px-8 py-3 rounded-full">Quay lại</button>
      </div>
    );
  }

  const currentWord = quizWords[currentIndex];

  const handleCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (showResult) return;

    const isCorrect = answer.toLowerCase().trim() === currentWord.word.toLowerCase().trim();
    if (isCorrect) {
      setShowResult('correct');
      setScore(s => s + 1);
    } else {
      setShowResult('wrong');
    }

    setTimeout(() => {
      if (currentIndex < quizWords.length - 1) {
        setCurrentIndex(i => i + 1);
        setAnswer('');
        setShowResult(null);
      } else {
        setFinished(true);
      }
    }, 1500);
  };

  if (finished) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-12 rounded-[32px] text-center shadow-sm max-w-md mx-auto"
      >
        <h2 className="text-3xl font-serif font-bold mb-4">Hoàn thành!</h2>
        <div className="text-5xl font-bold text-[#5A5A40] mb-6">{score}/{quizWords.length}</div>
        <p className="text-[#5A5A40] mb-8">Bạn đã hoàn thành bài kiểm tra từ vựng.</p>
        <button onClick={onComplete} className="w-full bg-[#5A5A40] text-white py-4 rounded-full font-medium">Quay lại bảng từ</button>
      </motion.div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6 flex items-center justify-between text-sm font-medium text-[#5A5A40]">
        <span>Câu hỏi {currentIndex + 1}/{quizWords.length}</span>
        <span>Điểm: {score}</span>
      </div>
      
      <motion.div 
        key={currentIndex}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-white p-10 rounded-[32px] shadow-sm relative overflow-hidden"
      >
        <div className="text-center mb-8">
          <span className="text-xs uppercase tracking-widest text-[#5A5A40] opacity-50 mb-2 block">Dịch nghĩa</span>
          <h3 className="text-2xl font-bold text-[#5A5A40]">{currentWord.translation}</h3>
          <p className="mt-4 text-sm italic text-[#5A5A40] opacity-70">"{currentWord.example.replace(new RegExp(currentWord.word, 'gi'), '___')}"</p>
        </div>

        <form onSubmit={handleCheck} className="space-y-4">
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Nhập từ tiếng Anh..."
            autoFocus
            className={cn(
              "w-full h-14 px-6 rounded-2xl border-2 transition-all text-center text-xl font-bold",
              showResult === 'correct' ? "border-green-500 bg-green-50" : 
              showResult === 'wrong' ? "border-red-500 bg-red-50" : 
              "border-[#F5F5F0] focus:border-[#5A5A40] focus:ring-0"
            )}
            disabled={!!showResult}
          />
          <button
            type="submit"
            disabled={!answer.trim() || !!showResult}
            className="w-full h-14 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4A4A30] transition-colors disabled:opacity-50"
          >
            Kiểm tra
          </button>
        </form>

        <AnimatePresence>
          {showResult && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-0 bottom-0 py-4 flex items-center justify-center gap-2 bg-white/90 backdrop-blur-sm"
            >
              {showResult === 'correct' ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                  <span className="text-green-600 font-bold">Chính xác!</span>
                </>
              ) : (
                <>
                  <XCircle className="w-6 h-6 text-red-500" />
                  <span className="text-red-600 font-bold">Sai rồi! Đáp án: {currentWord.word}</span>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
