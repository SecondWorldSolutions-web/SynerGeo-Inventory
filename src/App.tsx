/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Package, 
  Calendar, 
  Scan, 
  Printer, 
  Settings, 
  Plus, 
  Search, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  Box,
  Truck,
  ClipboardList,
  RefreshCw,
  Camera,
  Archive,
  ChevronDown,
  ChevronUp,
  Volume2,
  Lightbulb,
  Layers,
  Grid,
  Tv,
  Wrench,
  Palette,
  Activity,
  RotateCcw,
  Trash2,
  Edit2,
  Save,
  Sparkles,
  Key,
  Mail,
  Lock,
  ShieldAlert
} from 'lucide-react';
import { cn } from './lib/utils';
import { db, auth, isFirebaseConfigured } from './firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, deleteDoc, getDocs, setDoc, runTransaction, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, signInAnonymously } from 'firebase/auth';

// Mock Data for Demo Mode
const MOCK_INVENTORY: InventoryItem[] = [
  { id: '1', name: 'Video Panel P3.9', category: 'Video', barcode: 'VID-001', quantity: 100, availableQuantity: 100, location: 'A-1-1', status: 'Available', assetTags: ['vid-001-a', 'vid-001-b'] },
  { id: '2', name: 'Truss 10ft Silver', category: 'Trussing', barcode: 'TRS-001', quantity: 50, availableQuantity: 50, location: 'B-2-1', status: 'Available' },
  { id: '3', name: 'Stage Deck 4x8', category: 'Staging', barcode: 'STG-001', quantity: 40, availableQuantity: 40, location: 'C-1-1', status: 'Available' },
  { id: '4', name: 'Moving Head Spot', category: 'Lighting', barcode: 'LGT-001', quantity: 24, availableQuantity: 24, location: 'D-3-1', status: 'Available', assetTags: ['lgt-001-a', 'lgt-001-b', 'lgt-001-c', 'lgt-001-d'] },
  { id: '5', name: 'L-Acoustics K2', category: 'Sound', barcode: 'SND-001', quantity: 12, availableQuantity: 12, location: 'E-1-1', status: 'Available' },
  { id: '6', name: 'Custom Scenic Flat', category: 'Scenic', barcode: 'SCN-001', quantity: 8, availableQuantity: 8, location: 'F-2-1', status: 'Available' },
];

const MOCK_ROAD_CASES: RoadCase[] = [
  {
    id: 'rc-1',
    name: 'Moving Head Case 1',
    barcode: 'CASE-001',
    childBarcodes: ['lgt-001-a', 'lgt-001-b', 'lgt-001-c', 'lgt-001-d']
  },
  {
    id: 'rc-2',
    name: 'Video Panels Case A',
    barcode: 'CASE-VID-01',
    childBarcodes: ['vid-001-a', 'vid-001-b']
  }
];

const MOCK_SHOWS: Show[] = [];

// Types
interface InventoryItem {
  id: string;
  name: string;
  category: string;
  barcode: string;
  quantity: number;
  availableQuantity: number;
  location: string;
  status: 'Available' | 'Rented' | 'Maintenance' | 'Retired';
  assetTags?: string[];
  imageUrl?: string;
}

interface Show {
  id: string;
  name: string;
  client: string;
  startDate: string;
  endDate: string;
  status: 'Draft' | 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled';
  archived?: boolean;
  pullSheet: {
    itemId: string;
    quantity: number;
    scannedOut: number;
    scannedIn: number;
  }[];
}

interface RoadCase {
  id: string;
  name: string;
  barcode: string;
  childBarcodes: string[];
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    tenantId: string;
    providerInfo: {
      providerId: string;
      displayName: string;
      email: string;
      photoUrl: string;
    }[];
  }
}

const handleFirestoreError = (error: any, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || 'anonymous',
      email: auth?.currentUser?.email || '',
      emailVerified: auth?.currentUser?.emailVerified || false,
      isAnonymous: auth?.currentUser?.isAnonymous || true,
      tenantId: auth?.currentUser?.tenantId || '',
      providerInfo: auth?.currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  if (error.message?.includes('permission-denied')) {
    throw new Error(JSON.stringify(errInfo));
  }
};

const RECOGNIZED_PASSKEYS: Record<string, { email: string, role: 'owner' | 'manager', displayName: string }> = {
  'OWNER-SAC-7348': { email: 'mau.salvatore17@gmail.com', role: 'owner', displayName: 'Mau Salvatore' },
  'MGR-CHICAGO-9512': { email: 'info@synergeo.us', role: 'manager', displayName: 'Synergeo Assistant' }
};

const AUTHORIZED_EMAILS: Record<string, { role: 'owner' | 'manager', displayName: string }> = {
  'mau.salvatore17@gmail.com': { role: 'owner', displayName: 'Mau Salvatore' },
  'info@synergeo.us': { role: 'manager', displayName: 'Synergeo Assistant' },
  'demo@synergeo.us': { role: 'owner', displayName: 'Demo Administrator' }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'shows' | 'scanner' | 'tracker' | 'cases' | 'settings'>('dashboard');
  const [loginMethod, setLoginMethod] = useState<'google' | 'passkey'>('passkey');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPasskey, setLoginPasskey] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [roadCases, setRoadCases] = useState<RoadCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [isShowModalOpen, setIsShowModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [showToDelete, setShowToDelete] = useState<Show | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'info'
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void, type: 'danger' | 'info' = 'info') => {
    setConfirmModal({ isOpen: true, title, message, onConfirm, type });
  };

  // Auth Listener
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      // Demo Mode Auth - Check if there is an active local passkey session
      const storedSession = localStorage.getItem('synergeo_session');
      if (storedSession) {
        try {
          setUser(JSON.parse(storedSession));
        } catch (e) {
          setUser({
            displayName: 'Demo Administrator',
            photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Synergeo',
            email: 'demo@synergeo.us',
            role: 'owner'
          });
        }
      } else {
        setUser({
          displayName: 'Demo Administrator',
          photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Synergeo',
          email: 'demo@synergeo.us',
          role: 'owner'
        });
      }
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        if (fbUser.isAnonymous) {
          // Anonymous authentication represents our Passkey/Access Code session
          const storedSession = localStorage.getItem('synergeo_session');
          if (storedSession) {
            try {
              const sessionUser = JSON.parse(storedSession);
              setUser(sessionUser);
            } catch (e) {
              setUser(null);
            }
          } else {
            setUser(null);
          }
          setLoading(false);
          return;
        }

        // Standard Google auth
        const email = fbUser.email?.toLowerCase();
        if (email && AUTHORIZED_EMAILS[email]) {
          const authDetails = AUTHORIZED_EMAILS[email];
          const fullUser = {
            uid: fbUser.uid,
            displayName: fbUser.displayName || authDetails.displayName,
            photoURL: fbUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${fbUser.email}`,
            email: fbUser.email,
            role: authDetails.role
          };
          setUser(fullUser);
        } else {
          // Unauthorized email signed in! Show error, sign them out of Firebase
          await signOut(auth);
          setUser(null);
          showConfirm(
            "Access Restricted",
            "This Google account is not authorized to access this system. Only registered team members have permission.",
            () => {},
            'danger'
          );
        }
      } else {
        // No firebase user
        // Check if there is an active local passkey session
        const storedSession = localStorage.getItem('synergeo_session');
        if (storedSession) {
          try {
            const sessionUser = JSON.parse(storedSession);
            // Sign in anonymously to get a live Firebase DB auth session under the hood!
            await signInAnonymously(auth);
            setUser(sessionUser);
          } catch (e) {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    // Cleanup: Ensure the "Summer Gala 2026" (s1) is gone from local storage and state
    const cleanupMockData = async () => {
      if (!isFirebaseConfigured) {
        const savedShows = localStorage.getItem('synergeo_shows');
        if (savedShows) {
          const parsed = JSON.parse(savedShows);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter(s => s.id !== 's1');
            if (filtered.length !== parsed.length) {
              localStorage.setItem('synergeo_shows', JSON.stringify(filtered));
              setShows(filtered);
            }
          }
        }
      } else if (db) {
        try {
          await deleteDoc(doc(db, 'shows', 's1'));
        } catch (e) {
          // Ignore if already deleted
        }
      }
    };
    cleanupMockData();

    if (!isFirebaseConfigured || !db) {
      // Demo Mode Data Loading
      try {
        const savedInventory = localStorage.getItem('synergeo_inventory');
        const savedShows = localStorage.getItem('synergeo_shows');
        
        if (savedInventory) {
          const parsed = JSON.parse(savedInventory);
          if (Array.isArray(parsed)) setInventory(parsed);
          else setInventory(MOCK_INVENTORY);
        } else {
          setInventory(MOCK_INVENTORY);
        }

        if (savedShows) {
          const parsed = JSON.parse(savedShows);
          if (Array.isArray(parsed)) setShows(parsed);
          else setShows(MOCK_SHOWS);
        } else {
          setShows(MOCK_SHOWS);
        }

        const savedRoadCases = localStorage.getItem('synergeo_roadcases');
        if (savedRoadCases) {
          const parsed = JSON.parse(savedRoadCases);
          if (Array.isArray(parsed)) setRoadCases(parsed);
          else setRoadCases(MOCK_ROAD_CASES);
        } else {
          setRoadCases(MOCK_ROAD_CASES);
        }
      } catch (e) {
        console.error("Failed to load demo data:", e);
        setInventory(MOCK_INVENTORY);
        setShows(MOCK_SHOWS);
        setRoadCases(MOCK_ROAD_CASES);
      }
      return;
    }

    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      if (snapshot.empty) {
        // Seed initial data with consistent IDs
        MOCK_INVENTORY.forEach(item => setDoc(doc(db, 'inventory', item.id), item));
      }
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setInventory(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'inventory');
    });

    const unsubShows = onSnapshot(collection(db, 'shows'), (snapshot) => {
      if (snapshot.empty) {
        // Seed initial show with consistent ID
        MOCK_SHOWS.forEach(show => setDoc(doc(db, 'shows', show.id), show));
      }
      const showList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Show));
      setShows(showList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'shows');
    });

    const unsubRoadCases = onSnapshot(collection(db, 'roadCases'), (snapshot) => {
      if (snapshot.empty) {
        MOCK_ROAD_CASES.forEach(rc => setDoc(doc(db, 'roadCases', rc.id), rc));
      }
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RoadCase));
      setRoadCases(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'roadCases');
    });

    return () => {
      unsubInventory();
      unsubShows();
      unsubRoadCases();
    };
  }, [user]);

  // Save to LocalStorage in Demo Mode
  useEffect(() => {
    if (!isFirebaseConfigured && user) {
      localStorage.setItem('synergeo_inventory', JSON.stringify(inventory));
      localStorage.setItem('synergeo_shows', JSON.stringify(shows));
      localStorage.setItem('synergeo_roadcases', JSON.stringify(roadCases));
    }
  }, [inventory, shows, roadCases]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/api-key-not-valid') {
        showConfirm(
          "Firebase Configuration",
          "Firebase API Key is invalid. Please check your Firebase project settings.",
          () => {},
          'danger'
        );
      } else {
        showConfirm(
          "Login Failed",
          `Authentication failed: ${error.message}`,
          () => {},
          'danger'
        );
      }
    }
  };

  const handlePasskeyLogin = async (emailInput: string, codeInput: string) => {
    const trimmedEmail = emailInput.trim().toLowerCase();
    const trimmedCode = codeInput.trim().toUpperCase();

    const keyMatch = RECOGNIZED_PASSKEYS[trimmedCode];
    if (keyMatch && keyMatch.email.toLowerCase() === trimmedEmail) {
      const sessionUser = {
        displayName: keyMatch.displayName,
        photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(keyMatch.displayName)}`,
        email: keyMatch.email,
        role: keyMatch.role,
        isCustomSession: true
      };

      if (isFirebaseConfigured && auth) {
        setLoading(true);
        try {
          localStorage.setItem('synergeo_session', JSON.stringify(sessionUser));
          await signInAnonymously(auth);
          setUser(sessionUser);
          setLoading(false);
        } catch (error: any) {
          console.error("Passkey Firebase connection failed:", error);
          setLoading(false);
          if (error.code === 'auth/operation-not-allowed') {
            showConfirm(
              "Configuration Required",
              "Anonymous authentication is not enabled in your Firebase project. To enable it: Go to Firebase Console -> Authentication -> Sign-in method -> under 'Sign-in providers', click 'Add new provider', select 'Anonymous', toggle it to Enabled, and click Save.",
              () => {},
              'danger'
            );
          } else {
            showConfirm(
              "Connection Error",
              `Authenticating on secure server failed: ${error.message || 'Please check your network.'}`,
              () => {},
              'danger'
            );
          }
        }
      } else {
        localStorage.setItem('synergeo_session', JSON.stringify(sessionUser));
        setUser(sessionUser);
      }
      return true;
    } else {
      showConfirm(
        "Invalid Credentials",
        "The email address or security login passkey is incorrect. Please double check.",
        () => {},
        'danger'
      );
      return false;
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('synergeo_session');
      if (isFirebaseConfigured && auth) {
        await signOut(auth);
      }
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const addInventoryItem = async (item: Omit<InventoryItem, 'id'>) => {
    if (!isFirebaseConfigured) {
      const newItem = { ...item, id: Math.random().toString(36).substr(2, 9) };
      setInventory([...inventory, newItem]);
      setIsInventoryModalOpen(false);
      return;
    }
    try {
      await addDoc(collection(db, 'inventory'), item);
      setIsInventoryModalOpen(false);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.CREATE, 'inventory');
      console.error("Error adding item:", error);
    }
  };

  const updateInventoryItem = async (id: string, updates: Partial<InventoryItem>) => {
    if (!isFirebaseConfigured) {
      setInventory(inventory.map(item => item.id === id ? { ...item, ...updates } : item));
      setEditingItem(null);
      setIsInventoryModalOpen(false);
      return;
    }
    try {
      await updateDoc(doc(db, 'inventory', id), updates);
      setEditingItem(null);
      setIsInventoryModalOpen(false);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `inventory/${id}`);
      console.error("Error updating item:", error);
    }
  };

  const deleteInventoryItem = async (id: string) => {
    if (!isFirebaseConfigured) {
      setInventory(inventory.filter(item => item.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'inventory', id));
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `inventory/${id}`);
      console.error("Error deleting item:", error);
    }
  };

  const createShow = async (show: Omit<Show, 'id'>) => {
    if (!isFirebaseConfigured) {
      const newShow = { ...show, id: Math.random().toString(36).substr(2, 9), archived: false };
      setShows([...shows, newShow]);
      setIsShowModalOpen(false);
      return;
    }
    try {
      await addDoc(collection(db, 'shows'), { ...show, archived: false });
      setIsShowModalOpen(false);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.CREATE, 'shows');
      console.error("Error creating show:", error);
    }
  };

  const deleteShow = async (id: string) => {
    const show = shows.find(s => s.id === id);
    if (!show) {
      setShowToDelete(null);
      return;
    }

    // Return inventory to available pool
    const itemsToReturn = show.pullSheet || [];
    
    if (!isFirebaseConfigured) {
      // Local state update
      setInventory(prevInv => prevInv.map(invItem => {
        const pullItem = itemsToReturn.find(p => p.itemId === invItem.id);
        if (pullItem) {
          const amountToReturn = pullItem.quantity - pullItem.scannedIn;
          return { ...invItem, availableQuantity: invItem.availableQuantity + amountToReturn };
        }
        return invItem;
      }));
      
      setShows(prev => prev.filter(s => s.id !== id));
      setShowToDelete(null);
      return;
    }

    // Firebase mode
    try {
      // Run as a transaction to ensure all inventory updates and deletion succeed atomically
      await runTransaction(db, async (transaction) => {
        const showRef = doc(db, 'shows', id);
        const showDoc = await transaction.get(showRef);

        if (!showDoc.exists()) {
          throw new Error("Show document not found; it may have been deleted already");
        }

        const showData = showDoc.data() as Show;
        const pullSheetItems = showData.pullSheet || [];

        // 1. Gather all required reads first (Firestore transaction mandate)
        const readItems = [];
        for (const pullItem of pullSheetItems) {
          const invRef = doc(db, 'inventory', pullItem.itemId);
          const invDoc = await transaction.get(invRef);
          readItems.push({ invRef, invDoc, pullItem });
        }

        // 2. Queue all updates
        for (const { invRef, invDoc, pullItem } of readItems) {
          if (invDoc.exists()) {
            const invData = invDoc.data() as InventoryItem;
            const amountToReturn = pullItem.quantity - (pullItem.scannedIn || 0);
            if (amountToReturn > 0) {
              const currentAvail = invData.availableQuantity || 0;
              const newAvail = Math.min(invData.quantity, currentAvail + amountToReturn);
              transaction.update(invRef, { availableQuantity: newAvail });
            }
          }
        }

        // 3. Atomically delete show doc
        transaction.delete(showRef);
      });
      
      // Always remove locally if it was a mock ID or if we want to be optimistic
      if (id.startsWith('s')) {
        setShows(prev => prev.filter(s => s.id !== id));
      }
      
      setShowToDelete(null);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `shows/${id}`);
      console.error("Error deleting show:", error);
      // Fallback: remove locally
      setShows(prev => prev.filter(s => s.id !== id));
      setShowToDelete(null);
    }
  };

  const toggleArchiveShow = async (id: string, currentStatus: boolean) => {
    const show = shows.find(s => s.id === id);
    if (!show) return;

    const itemsToProcess = show.pullSheet || [];
    const isArchiving = !currentStatus;

    if (!isFirebaseConfigured) {
      setInventory(prevInv => prevInv.map(invItem => {
        const pullItem = itemsToProcess.find(p => p.itemId === invItem.id);
        if (pullItem) {
          const quantity = pullItem.quantity || 0;
          return { 
            ...invItem, 
            availableQuantity: isArchiving 
              ? invItem.availableQuantity + quantity 
              : Math.max(0, invItem.availableQuantity - quantity) 
          };
        }
        return invItem;
      }));
      setShows(prev => prev.map(s => s.id === id ? { ...s, archived: isArchiving } : s));
      return;
    }

    try {
      // Use a transaction to ensure atomicity, keeping all READS before WRITES
      await runTransaction(db, async (transaction) => {
        const showRef = doc(db, 'shows', id);
        
        // 1. Compile all reads beforehand
        const readItems = [];
        for (const pullItem of itemsToProcess) {
          const invRef = doc(db, 'inventory', pullItem.itemId);
          const invDoc = await transaction.get(invRef);
          readItems.push({ invRef, invDoc, pullItem });
        }

        // 2. Perform all writes after reads are complete
        transaction.update(showRef, { archived: isArchiving });

        for (const { invRef, invDoc, pullItem } of readItems) {
          if (invDoc.exists()) {
            const invData = invDoc.data() as InventoryItem;
            const quantity = pullItem.quantity || 0;
            const newAvail = isArchiving 
              ? (invData.availableQuantity || 0) + quantity 
              : Math.max(0, (invData.availableQuantity || 0) - quantity);
            transaction.update(invRef, { availableQuantity: newAvail });
          }
        }
      });
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `shows/${id}`);
      console.error("Error toggling archive status:", error);
    }
  };

  const updateShowDetails = async (id: string, details: { name: string, client: string, startDate: string, endDate: string, status: 'Draft' | 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled' }) => {
    const show = shows.find(s => s.id === id);
    if (!show) return;

    if (!isFirebaseConfigured) {
      const updatedShows = shows.map(s => s.id === id ? { ...s, ...details } : s);
      setShows(updatedShows);
      
      // Sync inventory locally
      const newInventory = inventory.map(item => ({
        ...item,
        availableQuantity: item.quantity
      }));

      updatedShows.forEach(sh => {
        if (!sh.archived && sh.status !== 'Cancelled') {
          (sh.pullSheet || []).forEach(pullItem => {
            const invItem = newInventory.find(i => i.id === pullItem.itemId);
            if (invItem) {
              invItem.availableQuantity = Math.max(0, invItem.availableQuantity - pullItem.quantity);
            }
          });
        }
      });
      setInventory(newInventory);
      return;
    }
    
    try {
      const showRef = doc(db, 'shows', id);
      await updateDoc(showRef, details);
      
      if (details.status !== show.status) {
        setTimeout(async () => {
          await syncInventory();
        }, 300);
      }
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `shows/${id}`);
      console.error("Error updating show details:", error);
    }
  };

  const addRoadCase = async (rc: Omit<RoadCase, 'id'>) => {
    const id = 'rc-' + Date.now();
    const newCase = { id, ...rc };
    if (!isFirebaseConfigured) {
      setRoadCases(prev => [...prev, newCase]);
      return;
    }
    try {
      await setDoc(doc(db, 'roadCases', id), newCase);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, `roadCases/${id}`);
      console.error("Failed to add road case:", error);
    }
  };

  const updateRoadCase = async (id: string, rc: Partial<RoadCase>) => {
    if (!isFirebaseConfigured) {
      setRoadCases(prev => prev.map(c => c.id === id ? { ...c, ...rc } : c));
      return;
    }
    try {
      await updateDoc(doc(db, 'roadCases', id), rc);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `roadCases/${id}`);
      console.error("Failed to update road case:", error);
    }
  };

  const deleteRoadCase = async (id: string) => {
    if (!isFirebaseConfigured) {
      setRoadCases(prev => prev.filter(c => c.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'roadCases', id));
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `roadCases/${id}`);
      console.error("Failed to delete road case:", error);
    }
  };

  const syncInventory = async () => {
    if (!isFirebaseConfigured) {
      // Local sync
      const newInventory = inventory.map(item => ({
        ...item,
        availableQuantity: item.quantity
      }));

      shows.forEach(show => {
        if (!show.archived && show.status !== 'Cancelled') {
          (show.pullSheet || []).forEach(pullItem => {
            const invItem = newInventory.find(i => i.id === pullItem.itemId);
            if (invItem) {
              invItem.availableQuantity = Math.max(0, invItem.availableQuantity - pullItem.quantity);
            }
          });
        }
      });

      setInventory(newInventory);
      return;
    }

    try {
      // Firebase sync - Query the absolute database truth directly (bypasses stale cached client states)
      const inventorySnapshot = await getDocs(collection(db, 'inventory'));
      const showsSnapshot = await getDocs(collection(db, 'shows'));

      const dbInventory: InventoryItem[] = [];
      inventorySnapshot.forEach(doc => {
        dbInventory.push({ id: doc.id, ...(doc.data() as Omit<InventoryItem, 'id'>) });
      });

      const dbShows: Show[] = [];
      showsSnapshot.forEach(doc => {
        dbShows.push({ id: doc.id, ...(doc.data() as Omit<Show, 'id'>) });
      });

      const batch = writeBatch(db);
      
      // 1. Reset all inventory to full quantity
      dbInventory.forEach(item => {
        batch.update(doc(db, 'inventory', item.id), {
          availableQuantity: item.quantity
        });
      });

      // 2. Calculate deductions from active shows
      const deductions: Record<string, number> = {};
      dbShows.forEach(show => {
        if (!show.archived && show.status !== 'Cancelled') {
          (show.pullSheet || []).forEach(pullItem => {
            deductions[pullItem.itemId] = (deductions[pullItem.itemId] || 0) + pullItem.quantity;
          });
        }
      });

      // 3. Apply deductions
      Object.entries(deductions).forEach(([itemId, quantity]) => {
        const item = dbInventory.find(i => i.id === itemId);
        if (item) {
          const newAvail = Math.max(0, item.quantity - quantity);
          batch.update(doc(db, 'inventory', itemId), {
            availableQuantity: newAvail
          });
        }
      });

      await batch.commit();
      console.log("Inventory sync complete (direct from database)");
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, 'inventory');
      console.error("Error syncing inventory:", error);
    }
  };

  const resetSystem = async () => {
    if (!isFirebaseConfigured || !db) {
      setInventory(MOCK_INVENTORY);
      setShows([]);
      localStorage.setItem('synergeo_inventory', JSON.stringify(MOCK_INVENTORY));
      localStorage.setItem('synergeo_shows', JSON.stringify([]));
      return;
    }

    try {
      // 1. Delete all current inventory
      const inventorySnapshot = await getDocs(collection(db, 'inventory'));
      const batch1 = writeBatch(db);
      inventorySnapshot.docs.forEach(d => {
        batch1.delete(d.ref);
      });

      // 2. Delete all current shows
      const showsSnapshot = await getDocs(collection(db, 'shows'));
      showsSnapshot.docs.forEach(d => {
        batch1.delete(d.ref);
      });
      await batch1.commit();

      // 3. Re-seed default MOCK_INVENTORY
      const batch2 = writeBatch(db);
      MOCK_INVENTORY.forEach(item => {
        batch2.set(doc(db, 'inventory', item.id), item);
      });
      await batch2.commit();

    } catch (error: any) {
      console.error("Failed to reset database:", error);
    }
  };

  const addItemToPullSheet = async (showId: string, itemId: string, quantity: number) => {
    const qty = isNaN(quantity) ? 1 : Math.max(1, quantity);
    console.log(`Adding ${qty} of ${itemId} to show ${showId}`);
    
    // Optimistic Update for immediate UI feedback
    const updateLocalState = (sId: string, iId: string, q: number) => {
      setInventory(prevInv => prevInv.map(item => 
        item.id === iId 
          ? { ...item, availableQuantity: Math.max(0, item.availableQuantity - q) }
          : item
      ));

      setShows(prevShows => {
        const show = prevShows.find(s => s.id === sId);
        if (!show) return prevShows;
        
        const currentPullSheet = show.pullSheet || [];
        const existingItem = currentPullSheet.find(p => p.itemId === iId);
        let newPullSheet;

        if (existingItem) {
          newPullSheet = currentPullSheet.map(p => 
            p.itemId === iId ? { ...p, quantity: (p.quantity || 0) + q } : p
          );
        } else {
          newPullSheet = [...currentPullSheet, { itemId: iId, quantity: q, scannedOut: 0, scannedIn: 0 }];
        }
        
        return prevShows.map(s => s.id === sId ? { ...s, pullSheet: newPullSheet } : s);
      });
    };

    if (!isFirebaseConfigured) {
      updateLocalState(showId, itemId, qty);
      return;
    }

    // Firebase mode with Transaction for atomicity
    try {
      // Apply optimistic update locally first
      updateLocalState(showId, itemId, qty);

      await runTransaction(db, async (transaction) => {
        const showRef = doc(db, 'shows', showId);
        const invRef = doc(db, 'inventory', itemId);
        
        const showDoc = await transaction.get(showRef);
        const invDoc = await transaction.get(invRef);

        if (!showDoc.exists()) throw new Error("Show not found in database");
        if (!invDoc.exists()) throw new Error("Inventory item not found in database");

        const showData = showDoc.data() as Show;
        const invData = invDoc.data() as InventoryItem;

        // 1. Update inventory available quantity
        const currentAvail = invData.availableQuantity || 0;
        const newAvail = Math.max(0, currentAvail - qty);
        transaction.update(invRef, { availableQuantity: newAvail });

        // 2. Update show pull sheet
        const currentPullSheet = showData.pullSheet || [];
        const existingItem = currentPullSheet.find(p => p.itemId === itemId);
        let newPullSheet;

        if (existingItem) {
          newPullSheet = currentPullSheet.map(p => 
            p.itemId === itemId ? { ...p, quantity: (p.quantity || 0) + qty } : p
          );
        } else {
          newPullSheet = [...currentPullSheet, { itemId, quantity: qty, scannedOut: 0, scannedIn: 0 }];
        }

        transaction.update(showRef, { pullSheet: newPullSheet });
      });
      console.log("Successfully synced pull sheet update to Firebase");
    } catch (error: any) {
      console.error("Error adding item to pull sheet:", error);
      // Revert optimistic update if needed (optional, but good for consistency)
      // For now, we'll just show the error
      if (error.message?.includes('permission-denied')) {
        handleFirestoreError(error, OperationType.WRITE, `shows/${showId} + inventory/${itemId}`);
      }
      throw error; 
    }
  };

  const removePullSheetItem = async (showId: string, itemId: string) => {
    console.log(`Removing item ${itemId} from show ${showId}`);
    
    const updateLocalState = (sId: string, iId: string) => {
      // Find the show to get the item quantity
      const show = shows.find(s => s.id === sId);
      if (!show) return;
      const pullSheetItem = (show.pullSheet || []).find(p => p.itemId === iId);
      if (!pullSheetItem) return;
      const q = pullSheetItem.quantity || 0;

      setInventory(prevInv => prevInv.map(item => 
        item.id === iId 
          ? { ...item, availableQuantity: item.availableQuantity + q }
          : item
      ));

      setShows(prevShows => prevShows.map(s => {
        if (s.id !== sId) return s;
        const newPullSheet = (s.pullSheet || []).filter(p => p.itemId !== iId);
        return { ...s, pullSheet: newPullSheet };
      }));
    };

    if (!isFirebaseConfigured) {
      updateLocalState(showId, itemId);
      return;
    }

    try {
      updateLocalState(showId, itemId);

      await runTransaction(db, async (transaction) => {
        const showRef = doc(db, 'shows', showId);
        const invRef = doc(db, 'inventory', itemId);
        
        const showDoc = await transaction.get(showRef);
        const invDoc = await transaction.get(invRef);

        if (!showDoc.exists()) throw new Error("Show not found in database");
        if (!invDoc.exists()) throw new Error("Inventory item not found in database");

        const showData = showDoc.data() as Show;
        const invData = invDoc.data() as InventoryItem;

        const pullSheetItem = (showData.pullSheet || []).find(p => p.itemId === itemId);
        if (!pullSheetItem) return; // already gone
        const q = pullSheetItem.quantity || 0;

        // 1. Update inventory available quantity
        const currentAvail = invData.availableQuantity || 0;
        const newAvail = currentAvail + q;
        transaction.update(invRef, { availableQuantity: newAvail });

        // 2. Update show pull sheet
        const newPullSheet = (showData.pullSheet || []).filter(p => p.itemId !== itemId);
        transaction.update(showRef, { pullSheet: newPullSheet });
      });
      console.log("Successfully synced pull sheet item removal to Firebase");
    } catch (error: any) {
      console.error("Error removing item from pull sheet:", error);
      if (error.message?.includes('permission-denied')) {
        handleFirestoreError(error, OperationType.WRITE, `shows/${showId} + inventory/${itemId}`);
      }
      throw error;
    }
  };

  const updatePullSheetItem = async (showId: string, itemId: string, updates: { quantity?: number, scannedOut?: number, scannedIn?: number }) => {
    console.log(`Updating pull sheet item ${itemId} for show ${showId}`, updates);
    
    const updateLocalState = (sId: string, iId: string, upds: typeof updates) => {
      const show = shows.find(s => s.id === sId);
      if (!show) return;
      const pullSheetItem = (show.pullSheet || []).find(p => p.itemId === iId);
      if (!pullSheetItem) return;

      const oldQty = pullSheetItem.quantity || 0;
      const newQty = upds.quantity !== undefined ? (isNaN(upds.quantity) ? 1 : Math.max(1, upds.quantity)) : oldQty;
      const qtyDiff = newQty - oldQty;

      setInventory(prevInv => prevInv.map(item => 
        item.id === iId 
          ? { ...item, availableQuantity: Math.max(0, item.availableQuantity - qtyDiff) }
          : item
      ));

      setShows(prevShows => prevShows.map(s => {
        if (s.id !== sId) return s;
        const newPullSheet = (s.pullSheet || []).map(p => {
          if (p.itemId !== iId) return p;
          return {
            ...p,
            quantity: newQty,
            scannedOut: upds.scannedOut !== undefined ? (isNaN(upds.scannedOut) ? 0 : Math.max(0, upds.scannedOut)) : (p.scannedOut || 0),
            scannedIn: upds.scannedIn !== undefined ? (isNaN(upds.scannedIn) ? 0 : Math.max(0, upds.scannedIn)) : (p.scannedIn || 0)
          };
        });
        return { ...s, pullSheet: newPullSheet };
      }));
    };

    if (!isFirebaseConfigured) {
      updateLocalState(showId, itemId, updates);
      return;
    }

    try {
      updateLocalState(showId, itemId, updates);

      await runTransaction(db, async (transaction) => {
        const showRef = doc(db, 'shows', showId);
        const invRef = doc(db, 'inventory', itemId);
        
        const showDoc = await transaction.get(showRef);
        const invDoc = await transaction.get(invRef);

        if (!showDoc.exists()) throw new Error("Show not found in database");
        if (!invDoc.exists()) throw new Error("Inventory item not found in database");

        const showData = showDoc.data() as Show;
        const invData = invDoc.data() as InventoryItem;

        const pullSheetItem = (showData.pullSheet || []).find(p => p.itemId === itemId);
        if (!pullSheetItem) return;

        const oldQty = pullSheetItem.quantity || 0;
        const newQty = updates.quantity !== undefined ? (isNaN(updates.quantity) ? 1 : Math.max(1, updates.quantity)) : oldQty;
        const qtyDiff = newQty - oldQty;

        // 1. Update inventory available quantity
        const currentAvail = invData.availableQuantity || 0;
        const newAvail = Math.max(0, currentAvail - qtyDiff);
        transaction.update(invRef, { availableQuantity: newAvail });

        // 2. Update show pull sheet
        const newPullSheet = (showData.pullSheet || []).map(p => {
          if (p.itemId !== itemId) return p;
          return {
            ...p,
            quantity: newQty,
            scannedOut: updates.scannedOut !== undefined ? (isNaN(updates.scannedOut) ? 0 : Math.max(0, updates.scannedOut)) : (p.scannedOut || 0),
            scannedIn: updates.scannedIn !== undefined ? (isNaN(updates.scannedIn) ? 0 : Math.max(0, updates.scannedIn)) : (p.scannedIn || 0)
          };
        });
        transaction.update(showRef, { pullSheet: newPullSheet });
      });
      console.log("Successfully synced pull sheet item update to Firebase");
    } catch (error: any) {
      console.error("Error updating pull sheet item:", error);
      if (error.message?.includes('permission-denied')) {
        handleFirestoreError(error, OperationType.WRITE, `shows/${showId} + inventory/${itemId}`);
      }
      throw error;
    }
  };

  const handleScanOperation = async (showId: string, barcode: string, mode: 'out' | 'in') => {
    const trimmedBarcode = barcode.toLowerCase().trim();
    const show = shows.find(s => s.id === showId);
    if (!show) return { success: false, message: "Show not found" };

    // 1. Is it a road case?
    const matchedCase = roadCases.find(rc => rc.barcode.toLowerCase() === trimmedBarcode);
    if (matchedCase) {
      if (!matchedCase.childBarcodes || matchedCase.childBarcodes.length === 0) {
        return { success: false, message: `Road Case '${matchedCase.name}' is empty. You can assign child barcodes to it under the Road Cases tab.` };
      }

      // We will collect updates for all child items in the case
      let tempPullSheet = [...(show.pullSheet || [])];
      let localInventoryUpdates: { itemId: string, newAvailableQuantity: number }[] = [];
      let firestoreUpdates: any[] = [];
      let scannedItemsCount = 0;
      let skippedItemsCount = 0;
      let matchedItemsLog: string[] = [];

      for (const childBarcode of matchedCase.childBarcodes) {
        const trimmedChild = childBarcode.toLowerCase().trim();
        const item = inventory.find(i => 
          i.barcode.toLowerCase() === trimmedChild || 
          (i.assetTags && i.assetTags.some(tag => tag.toLowerCase() === trimmedChild))
        );

        if (!item) {
          skippedItemsCount++;
          continue;
        }

        const pullSheetItemIndex = tempPullSheet.findIndex(p => p.itemId === item.id);
        const pullSheetItem = pullSheetItemIndex !== -1 ? tempPullSheet[pullSheetItemIndex] : null;

        if (!pullSheetItem) {
          skippedItemsCount++;
          continue; // Item not on pull sheet, skip
        }

        if (mode === 'out') {
          tempPullSheet = tempPullSheet.map((p, idx) => idx === pullSheetItemIndex ? { ...p, scannedOut: Math.min(p.quantity, p.scannedOut + 1) } : p);
        } else {
          tempPullSheet = tempPullSheet.map((p, idx) => idx === pullSheetItemIndex ? { ...p, scannedIn: Math.min(p.scannedOut, p.scannedIn + 1) } : p);
        }

        const newAvailableQuantity = mode === 'in' 
          ? Math.min(item.quantity, item.availableQuantity + 1)
          : item.availableQuantity;

        localInventoryUpdates.push({ itemId: item.id, newAvailableQuantity });
        if (isFirebaseConfigured && mode === 'in') {
          firestoreUpdates.push(updateDoc(doc(db, 'inventory', item.id), { availableQuantity: newAvailableQuantity }));
        }

        scannedItemsCount++;
        matchedItemsLog.push(item.name);
      }

      if (scannedItemsCount === 0) {
        return { 
          success: false, 
          message: `Road Case '${matchedCase.name}' scanned, but none of its containing barcodes could be processed (either not on pull sheet or items not found in inventory).` 
        };
      }

      if (!isFirebaseConfigured) {
        setShows(prevShows => prevShows.map(s => s.id === showId ? { ...s, pullSheet: tempPullSheet } : s));
        setInventory(prevInv => prevInv.map(i => {
          const update = localInventoryUpdates.find(u => u.itemId === i.id);
          return update ? { ...i, availableQuantity: update.newAvailableQuantity } : i;
        }));
        return { 
          success: true, 
          item: { name: `Case: ${matchedCase.name}`, category: 'Road Case config', barcode: matchedCase.barcode } as any, 
          matchedTag: matchedCase.name,
          message: `Successfully scanned Case '${matchedCase.name}' ${mode === 'out' ? 'OUT' : 'IN'}: processed ${scannedItemsCount} item(s) (${[...new Set(matchedItemsLog)].join(', ')}).`
        };
      }

      try {
        await Promise.all([
          updateDoc(doc(db, 'shows', showId), { pullSheet: tempPullSheet }),
          ...firestoreUpdates
        ]);
        return { 
          success: true, 
          item: { name: `Case: ${matchedCase.name}`, category: 'Road Case config', barcode: matchedCase.barcode } as any, 
          matchedTag: matchedCase.name,
          message: `Successfully scanned Case '${matchedCase.name}' ${mode === 'out' ? 'OUT' : 'IN'}: processed ${scannedItemsCount} item(s) (${[...new Set(matchedItemsLog)].join(', ')}).`
        };
      } catch (error) {
        console.error("Case scan operation failed:", error);
        return { success: false, message: "Database update failed" };
      }
    }

    // 2. Otherwise process as a single item as before:
    const item = inventory.find(i => 
      i.barcode.toLowerCase() === trimmedBarcode || 
      (i.assetTags && i.assetTags.some(tag => tag.toLowerCase() === trimmedBarcode))
    );

    if (!item) return { success: false, message: "Item not found" };

    const currentPullSheet = show.pullSheet || [];
    const pullSheetItem = currentPullSheet.find(p => p.itemId === item.id);
    
    if (!pullSheetItem) {
      return { success: false, message: "Item is not on this show's pull sheet" };
    }

    // Update Pull Sheet
    const newPullSheet = currentPullSheet.map(p => {
      if (p.itemId === item.id) {
        if (mode === 'out') {
          return { ...p, scannedOut: Math.min(p.quantity, p.scannedOut + 1) };
        } else {
          return { ...p, scannedIn: Math.min(p.scannedOut, p.scannedIn + 1) };
        }
      }
      return p;
    });

    // Update Inventory Available Quantity
    const newAvailableQuantity = mode === 'in' 
      ? Math.min(item.quantity, item.availableQuantity + 1)
      : item.availableQuantity;

    if (!isFirebaseConfigured) {
      setShows(prevShows => prevShows.map(s => s.id === showId ? { ...s, pullSheet: newPullSheet } : s));
      setInventory(prevInv => prevInv.map(i => i.id === item.id ? { ...i, availableQuantity: newAvailableQuantity } : i));
      return { success: true, item, matchedTag: trimmedBarcode };
    }

    try {
      const updates = [
        updateDoc(doc(db, 'shows', showId), { pullSheet: newPullSheet })
      ];
      
      if (mode === 'in') {
        updates.push(updateDoc(doc(db, 'inventory', item.id), { availableQuantity: newAvailableQuantity }));
      }

      await Promise.all(updates);
      return { success: true, item, matchedTag: trimmedBarcode };
    } catch (error) {
      console.error("Scan operation failed:", error);
      return { success: false, message: "Database update failed" };
    }
  };

  const handleQuickReturn = async (showId: string, itemId: string, quantityToReturn: number) => {
    if (quantityToReturn <= 0) return;

    const item = inventory.find(i => i.id === itemId);
    const show = shows.find(s => s.id === showId);

    if (!item || !show) return;

    const currentPullSheet = show.pullSheet || [];
    const pullSheetItem = currentPullSheet.find(p => p.itemId === item.id);
    if (!pullSheetItem) return;

    const outstanding = (pullSheetItem.scannedOut || 0) - (pullSheetItem.scannedIn || 0);
    const actualReturnAmt = Math.min(outstanding, quantityToReturn);
    if (actualReturnAmt <= 0) return;

    const newPullSheet = currentPullSheet.map(p => {
      if (p.itemId === item.id) {
        return { ...p, scannedIn: (p.scannedIn || 0) + actualReturnAmt };
      }
      return p;
    });

    const newAvailableQuantity = Math.min(item.quantity, (item.availableQuantity || 0) + actualReturnAmt);

    if (!isFirebaseConfigured) {
      setShows(prevShows => prevShows.map(s => s.id === showId ? { ...s, pullSheet: newPullSheet } : s));
      setInventory(prevInv => prevInv.map(i => i.id === item.id ? { ...i, availableQuantity: newAvailableQuantity } : i));
      return;
    }

    try {
      const updates = [
        updateDoc(doc(db, 'shows', showId), { pullSheet: newPullSheet }),
        updateDoc(doc(db, 'inventory', item.id), { availableQuantity: newAvailableQuantity })
      ];
      await Promise.all(updates);
    } catch (error) {
      console.error("Quick return failed:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-zinc-950/80 backdrop-blur-md rounded-2xl border border-white/10 p-8 space-y-8 shadow-2xl"
        >
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-extrabold tracking-tighter text-white">SYNERGEO</h1>
            <p className="text-zinc-400 text-sm">Inventory & Logistics Management System</p>
          </div>

          {/* Tab Selector */}
          <div className="flex border-b border-white/10 p-1 bg-white/5 rounded-lg">
            <button
              onClick={() => { setLoginMethod('passkey'); }}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2",
                loginMethod === 'passkey' ? "bg-white text-black shadow" : "text-zinc-400 hover:text-white"
              )}
            >
              <Key size={15} />
              Security Passkey
            </button>
            <button
              onClick={() => { setLoginMethod('google'); }}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2",
                loginMethod === 'google' ? "bg-white text-black shadow" : "text-zinc-400 hover:text-white"
              )}
            >
              <Lock size={15} />
              Google Auth
            </button>
          </div>

          <AnimatePresence mode="wait">
            {loginMethod === 'passkey' ? (
              <motion.form
                key="passkey-login"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (loginSubmitting) return;
                  setLoginSubmitting(true);
                  try {
                    await handlePasskeyLogin(loginEmail, loginPasskey);
                  } finally {
                    setLoginSubmitting(false);
                  }
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5 text-left">
                  <label className="text-xs text-zinc-400 font-medium">Assigned Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                    <input
                      type="email"
                      required
                      placeholder="e.g. info@synergeo.us"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-xs text-zinc-400 font-medium">Security Passkey</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                    <input
                      type="password"
                      required
                      placeholder="MGR-XXXX-XXXX"
                      value={loginPasskey}
                      onChange={(e) => setLoginPasskey(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors placeholder:tracking-normal"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loginSubmitting}
                  className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 disabled:opacity-50 font-bold rounded-lg transition-colors text-sm shadow-lg shadow-white/5 flex items-center justify-center gap-2"
                >
                  {loginSubmitting ? 'Verifying...' : 'Authorize Access'}
                </button>

                <p className="text-center text-[11px] text-zinc-500 mt-2 leading-relaxed">
                  Field & Chicago teams: authenticate using the security codes provided by the administrator to authorize this workstation.
                </p>
              </motion.form>
            ) : (
              <motion.div
                key="google-login"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div className="text-center space-y-2">
                  <p className="text-xs text-zinc-400">
                    Administrator single-sign-on:
                  </p>
                  <button 
                    onClick={handleLogin}
                    className="w-full py-3.5 bg-white text-black font-bold rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-3 text-sm shadow-lg shadow-white/5"
                  >
                    <LayoutDashboard size={18} />
                    Sign in with Google Account
                  </button>
                </div>

                <p className="text-center text-[11px] text-zinc-500 leading-relaxed">
                  Only whitelisted Google emails will succeed. If access is required, please have your program creator add your email address.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pt-4 border-t border-white/5 text-center flex items-center justify-center gap-1.5 text-zinc-500 text-[10px] tracking-wider uppercase">
            <ShieldAlert size={12} />
            Secure Session Gateway • Authorized Access Only
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Sidebar */}
      <aside className={cn(
        "bg-zinc-950 border-r border-white/10 transition-all duration-300 flex flex-col",
        isSidebarOpen ? "w-64" : "w-20"
      )}>
        <div className="p-6 flex items-center gap-4">
          <div className="w-8 h-8 bg-white rounded flex items-center justify-center text-black font-bold">S</div>
          {isSidebarOpen && <span className="font-bold tracking-widest">SYNERGEO</span>}
        </div>

        <nav className="flex-1 px-3 space-y-2">
          <NavItem 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<Box size={20} />} 
            label="Inventory" 
            active={activeTab === 'inventory'} 
            onClick={() => setActiveTab('inventory')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<Truck size={20} />} 
            label="Shows" 
            active={activeTab === 'shows'} 
            onClick={() => setActiveTab('shows')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<Scan size={20} />} 
            label="Scanner" 
            active={activeTab === 'scanner'} 
            onClick={() => setActiveTab('scanner')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<Archive size={20} />} 
            label="Road Cases" 
            active={activeTab === 'cases'} 
            onClick={() => setActiveTab('cases')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<Activity size={20} />} 
            label="Tracker" 
            active={activeTab === 'tracker'} 
            onClick={() => setActiveTab('tracker')}
            collapsed={!isSidebarOpen}
          />
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          {user.role === 'owner' && (
            <NavItem 
              icon={<Settings size={20} />} 
              label="Settings" 
              active={activeTab === 'settings'} 
              onClick={() => setActiveTab('settings')}
              collapsed={!isSidebarOpen}
            />
          )}
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-8 bg-zinc-950/50 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-white/5 rounded-lg">
              <Menu size={20} />
            </button>
            <h2 className="text-lg font-medium capitalize">{activeTab}</h2>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-white transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Search inventory, shows..." 
                className="bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 w-64 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all"
              />
            </div>
            <div className="flex items-center gap-3 pl-4 border-l border-white/10">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{user.displayName}</p>
                <p className="text-xs text-zinc-500">
                  {user.role === 'owner' ? 'System Owner' : 'Operations Manager'}
                </p>
              </div>
              <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-full border border-white/20" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && <DashboardView inventory={inventory} shows={shows} setActiveTab={setActiveTab} />}
            {activeTab === 'inventory' && (
              <InventoryView 
                inventory={inventory} 
                onAdd={() => { setEditingItem(null); setIsInventoryModalOpen(true); }} 
                onEdit={(item) => { setEditingItem(item); setIsInventoryModalOpen(true); }}
                onDelete={deleteInventoryItem}
                showConfirm={showConfirm}
              />
            )}
            {activeTab === 'shows' && (
              <ShowsView 
                shows={shows} 
                inventory={inventory} 
                onCreate={() => setIsShowModalOpen(true)} 
                onViewDetails={(show) => setSelectedShowId(show.id)}
                onDelete={(show) => setShowToDelete(show)}
                onToggleArchive={toggleArchiveShow}
                showConfirm={showConfirm}
              />
            )}
            {activeTab === 'scanner' && (
              <ScannerView 
                inventory={inventory} 
                shows={shows} 
                onScan={handleScanOperation}
                showConfirm={showConfirm}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsView 
                inventory={inventory} 
                shows={shows} 
                onSync={syncInventory}
                onReset={resetSystem}
                showConfirm={showConfirm}
              />
            )}
            {activeTab === 'cases' && (
              <RoadCasesView 
                roadCases={roadCases}
                inventory={inventory}
                onAdd={addRoadCase}
                onUpdate={updateRoadCase}
                onDelete={deleteRoadCase}
                showConfirm={showConfirm}
              />
            )}
            {activeTab === 'tracker' && (
              <AssetTrackerView 
                inventory={inventory} 
                shows={shows} 
                onQuickReturn={handleQuickReturn}
                showConfirm={showConfirm}
              />
            )}
          </AnimatePresence>

          {/* Modals */}
          <AnimatePresence>
            {isInventoryModalOpen && (
              <InventoryModal 
                item={editingItem} 
                inventory={inventory}
                onClose={() => setIsInventoryModalOpen(false)} 
                onSave={(data) => editingItem ? updateInventoryItem(editingItem.id, data) : addInventoryItem(data as any)} 
              />
            )}
            {isShowModalOpen && (
              <ShowModal 
                onClose={() => setIsShowModalOpen(false)} 
                onSave={createShow} 
              />
            )}
            {selectedShowId && (
              <ShowDetailsModal 
                show={shows.find(s => s.id === selectedShowId) || null} 
                inventory={inventory}
                onClose={() => setSelectedShowId(null)} 
                onAddItem={addItemToPullSheet}
                onUpdateDetails={updateShowDetails}
                onRemoveItem={removePullSheetItem}
                onUpdateItem={updatePullSheetItem}
                showConfirm={showConfirm}
              />
            )}
            {showToDelete && (
              <DeleteConfirmationModal 
                show={showToDelete}
                onClose={() => setShowToDelete(null)}
                onConfirm={deleteShow}
              />
            )}
            {confirmModal.isOpen && (
              <ConfirmModal 
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
                onConfirm={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                }}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              />
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, collapsed: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
        active ? "bg-white text-black font-bold" : "text-zinc-400 hover:text-white hover:bg-white/5"
      )}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
      {collapsed && active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full" />
      )}
    </button>
  );
}

// Views
function DashboardView({ inventory, shows, setActiveTab }: { inventory: InventoryItem[], shows: Show[], setActiveTab: (tab: any) => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-bold">Recent Shows</h3>
            <button 
              onClick={() => setActiveTab('shows')}
              className="text-xs text-zinc-500 hover:text-white transition-colors"
            >
              View All
            </button>
          </div>
          <div className="divide-y divide-white/5">
            {shows.slice(0, 5).map(show => (
              <div 
                key={show.id} 
                onClick={() => setActiveTab('shows')}
                className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
                    <Truck size={20} className="text-zinc-400" />
                  </div>
                  <div>
                    <p className="font-medium">{show.name}</p>
                    <p className="text-xs text-zinc-500">{show.client}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium px-2 py-1 bg-white/10 rounded-full">{show.status}</p>
                  <p className="text-[10px] text-zinc-600 mt-1">{show.startDate}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-bold">Inventory Status</h3>
            <button 
              onClick={() => setActiveTab('inventory')}
              className="text-xs text-zinc-500 hover:text-white transition-colors"
            >
              Manage
            </button>
          </div>
          <div className="p-6 space-y-6">
            {Array.from(new Set(inventory.map(i => i.category))).slice(0, 5).map(category => {
              const categoryItems = inventory.filter(i => i.category === category);
              const total = categoryItems.reduce((acc, i) => acc + i.quantity, 0);
              const available = categoryItems.reduce((acc, i) => acc + i.availableQuantity, 0);
              const inUse = total - available;
              
              return (
                <CategoryProgress 
                  key={category}
                  label={category} 
                  current={inUse} 
                  total={total} 
                />
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ConfirmModal({ title, message, onConfirm, onClose, type = 'info' }: { title: string, message: string, onConfirm: () => void, onClose: () => void, type?: 'danger' | 'info' }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              type === 'danger' ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"
            )}>
              {type === 'danger' ? <AlertCircle size={24} /> : <CheckCircle2 size={24} />}
            </div>
            <h3 className="text-xl font-bold">{title}</h3>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed">{message}</p>
        </div>
        <div className="p-6 bg-white/5 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold transition-colors",
              type === 'danger' ? "bg-red-600 hover:bg-red-700 text-white" : "bg-white hover:bg-zinc-200 text-black"
            )}
          >
            {type === 'danger' ? 'Delete' : 'Confirm'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
function CategoryProgress({ label, current, total }: { label: string, current: number, total: number, key?: any }) {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-500">
          <span className={cn(current > 0 ? "text-white font-bold" : "")}>{current}</span>
          <span className="mx-1">/</span>
          {total} <span className="ml-1 opacity-50">Allocated</span>
        </span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={cn(
            "h-full transition-colors duration-500",
            percentage > 90 ? "bg-red-500" : percentage > 70 ? "bg-yellow-500" : "bg-white"
          )}
        />
      </div>
    </div>
  );
}

function InventoryView({ inventory, onAdd, onEdit, onDelete, showConfirm }: { inventory: InventoryItem[], onAdd: () => void, onEdit: (item: InventoryItem) => void, onDelete: (id: string) => void, showConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info') => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const CATEGORIES = ['Sound', 'Lighting', 'Scenic', 'Staging', 'Trussing', 'Video', 'FX', 'Tools', 'Other/Misc.'];

  const mapCategory = (cat: string): string => {
    const c = cat ? cat.trim().toLowerCase() : '';
    if (c === 'sound') return 'Sound';
    if (c === 'lighting') return 'Lighting';
    if (c === 'scenic') return 'Scenic';
    if (c === 'staging' || c === 'stage decks' || c === 'stg') return 'Staging';
    if (c === 'trussing' || c === 'truss') return 'Trussing';
    if (c === 'video') return 'Video';
    if (c === 'fx' || c === 'effects' || c === 'special effects') return 'FX';
    if (c === 'tools' || c === 'tool') return 'Tools';
    return 'Other/Misc.';
  };

  const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    'Sound': <Volume2 size={18} className="text-blue-400" />,
    'Lighting': <Lightbulb size={18} className="text-yellow-400" />,
    'Scenic': <Palette size={18} className="text-indigo-400" />,
    'Staging': <Layers size={18} className="text-emerald-400" />,
    'Trussing': <Grid size={18} className="text-amber-400" />,
    'Video': <Tv size={18} className="text-purple-400" />,
    'FX': <Sparkles size={18} className="text-pink-400" />,
    'Tools': <Wrench size={18} className="text-rose-400" />,
    'Other/Misc.': <Package size={18} className="text-zinc-400" />
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }));
  };

  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    CATEGORIES.forEach(cat => {
      allExpanded[cat] = true;
    });
    setExpandedCategories(allExpanded);
  };

  const collapseAll = () => {
    setExpandedCategories({});
  };

  // Filter inventory
  const filtered = inventory.filter(item => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      (item.name || '').toLowerCase().includes(query) ||
      (item.barcode || '').toLowerCase().includes(query) ||
      (item.location || '').toLowerCase().includes(query) ||
      (item.category || '').toLowerCase().includes(query)
    );
  });

  // Grouped items
  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = [];
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  filtered.forEach(item => {
    const cat = mapCategory(item.category);
    if (!grouped[cat]) {
      grouped[cat] = [];
    }
    grouped[cat].push(item);
  });

  // Auto-expand categories that have matching items when searching
  useEffect(() => {
    if (searchQuery.trim() !== '') {
      const activeExpanded: Record<string, boolean> = {};
      CATEGORIES.forEach(cat => {
        if (grouped[cat] && grouped[cat].length > 0) {
          activeExpanded[cat] = true;
        }
      });
      setExpandedCategories(activeExpanded);
    }
  }, [searchQuery]);

  // Statistics for inventory
  const totalUniqueItems = inventory.length;
  const totalQty = inventory.reduce((acc, current) => acc + (current.quantity || 0), 0);
  const totalAvailable = inventory.reduce((acc, current) => acc + (current.availableQuantity || 0), 0);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
          <p className="text-zinc-400 text-sm">Manage, categorize, and track warehouse equipment.</p>
        </div>
        <button 
          onClick={onAdd}
          className="bg-white text-black px-4 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors shadow-lg shadow-white/5 self-start sm:self-auto"
        >
          <Plus size={18} />
          Add Item
        </button>
      </div>

      {/* Quick Metrics Bar & Search Controls */}
      <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="flex flex-wrap items-center gap-6 text-xs text-zinc-400">
          <div>
            Unique Items: <strong className="text-white text-sm ml-1 font-mono">{totalUniqueItems}</strong>
          </div>
          <div className="h-4 w-[1px] bg-white/10 hidden sm:block"></div>
          <div>
            Total Stock: <strong className="text-white text-sm ml-1 font-mono">{totalQty}</strong>
          </div>
          <div className="h-4 w-[1px] bg-white/10 hidden sm:block"></div>
          <div>
            Available: <strong className="text-emerald-400 text-sm ml-1 font-mono">{totalAvailable} / {totalQty}</strong>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
          {/* Collapse/Expand Actions */}
          <div className="flex items-center gap-2">
            <button 
              onClick={expandAll}
              className="text-xs font-semibold px-2.5 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-colors"
            >
              Expand All
            </button>
            <button 
              onClick={collapseAll}
              className="text-xs font-semibold px-2.5 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-colors"
            >
              Collapse All
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-zinc-500" size={16} />
            <input 
              type="text" 
              placeholder="Search gear, barcodes..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 bg-zinc-950/60 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-white/30 text-white placeholder-zinc-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-zinc-500 hover:text-white transition-colors text-xs font-bold"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Categories Accordions Parent */}
      <div className="space-y-4">
        {CATEGORIES.map(category => {
          const items = grouped[category] || [];
          const isExpanded = !!expandedCategories[category];
          const totalQtyInCat = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
          const totalAvailableInCat = items.reduce((sum, item) => sum + (item.availableQuantity || 0), 0);

          return (
            <div 
              key={category} 
              className={cn(
                "border rounded-xl transition-all duration-250 overflow-hidden",
                isExpanded ? "bg-zinc-900/30 border-white/15" : "bg-zinc-900/10 border-white/5 hover:border-white/10"
              )}
            >
              {/* Accordion header button */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between p-4 focus:outline-none hover:bg-white/[0.02] text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                    {CATEGORY_ICONS[category] || <Package size={18} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base tracking-tight flex items-center gap-2">
                      {category}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium border border-white/5">
                        {items.length} unique {items.length === 1 ? 'item' : 'items'}
                      </span>
                    </h3>
                    {items.length > 0 && (
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Qty: {totalAvailableInCat} avl. / {totalQtyInCat} total units
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-zinc-500 font-semibold uppercase px-2 py-1 bg-white/5 rounded">
                    {isExpanded ? 'Collapse' : 'Expand'}
                  </span>
                  {isExpanded ? (
                    <ChevronUp size={18} className="text-zinc-400" />
                  ) : (
                    <ChevronDown size={18} className="text-zinc-400" />
                  )}
                </div>
              </button>

              {/* Collapsed/Expanded Content body */}
              {isExpanded && (
                <div className="border-t border-white/10 bg-zinc-950/20">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/[0.02] border-b border-white/5 text-[11px] uppercase tracking-wider text-zinc-500">
                          <th className="px-6 py-3 font-medium">Item Name / ID</th>
                          <th className="px-6 py-3 font-medium">Quantity</th>
                          <th className="px-6 py-3 font-medium">Status</th>
                          <th className="px-6 py-3 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {items.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-10 text-center text-zinc-500 text-sm">
                              <Box size={32} className="mx-auto mb-2 opacity-10" />
                              No items in this category {searchQuery && 'matching search'}.
                            </td>
                          </tr>
                        ) : (
                          items.map(item => (
                            <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                    {item.imageUrl ? (
                                      <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <Box size={14} className="text-zinc-600" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-sm text-zinc-200">{item.name}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm font-medium">
                                  {item.availableQuantity} <span className="text-zinc-500">/ {item.quantity}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className={cn(
                                  "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full w-fit border",
                                  item.status === 'Available' ? "bg-green-500/5 text-green-400 border-green-500/15" :
                                  item.status === 'Maintenance' ? "bg-red-500/5 text-red-400 border-red-500/15" :
                                  "bg-zinc-500/5 text-zinc-400 border-white/5"
                                )}>
                                  {item.status}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button 
                                    onClick={() => onEdit(item)}
                                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                                    title="Edit Item"
                                  >
                                    <Settings size={16} />
                                  </button>
                                  <button 
                                    onClick={() => {
                                      showConfirm(
                                        "Delete Item",
                                        `Are you sure you want to delete ${item.name}? This action cannot be undone.`,
                                        () => onDelete(item.id),
                                        'danger'
                                      );
                                    }}
                                    className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors text-zinc-400 hover:text-red-500"
                                    title="Delete Item"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function ShowsView({ shows, inventory, onCreate, onViewDetails, onDelete, onToggleArchive, showConfirm }: { shows: Show[], inventory: InventoryItem[], onCreate: () => void, onViewDetails: (show: Show) => void, onDelete: (show: Show) => void, onToggleArchive: (id: string, status: boolean) => void, showConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info') => void }) {
  const [viewArchived, setViewArchived] = useState(false);
  
  const filteredShows = shows.filter(s => !!s.archived === viewArchived);

  const printPullSheet = (show: Show) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsHtml = show.pullSheet.map(item => {
      const invItem = inventory.find(i => i.id === item.itemId);
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${invItem?.name || 'Unknown'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${invItem?.barcode || 'N/A'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; border-left: 1px solid #eee; width: 100px;"></td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Pull Sheet - ${show.name}</title>
          <style>
            body { font-family: 'Inter', sans-serif; color: #333; padding: 40px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px; }
            .company-info h1 { margin: 0; letter-spacing: 2px; }
            .show-info { margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f4f4f4; text-align: left; padding: 10px; border-bottom: 2px solid #ddd; }
            .footer { margin-top: 50px; font-size: 12px; color: #666; text-align: center; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-info">
              <h1>SYNERGEO LOGISTICS</h1>
              <p>Warehouse Operations | Pull Sheet</p>
            </div>
            <div style="text-align: right;">
              <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
              <p><strong>Status:</strong> ${show.status}</p>
            </div>
          </div>
          
          <div class="show-info">
            <h2 style="margin: 0;">${show.name}</h2>
            <p style="margin: 5px 0;"><strong>Client:</strong> ${show.client}</p>
            <p style="margin: 5px 0;"><strong>Load Out:</strong> ${show.startDate} to ${show.endDate}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Equipment Name</th>
                <th>Barcode</th>
                <th style="text-align: center;">Qty Required</th>
                <th>Checked Out By</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="footer">
            <p>Generated by Synergeo Warehouse Management System</p>
            <p>Please ensure all items are scanned out using the digital scanner for real-time tracking.</p>
          </div>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Shows</h2>
          <p className="text-zinc-400 text-sm">
            {viewArchived 
              ? 'Reference past events, historical logs, and pull sheets.' 
              : 'Track upcoming events, pack lists, and active operations.'}
          </p>
        </div>
        <button 
          onClick={onCreate}
          className="bg-white text-black px-4 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors shadow-lg shadow-white/5 self-start sm:self-auto"
        >
          <Plus size={18} />
          Create Show
        </button>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setViewArchived(false)}
          className={cn(
            "px-4 py-3 text-sm font-semibold border-b-2 transition-all relative flex items-center gap-2",
            !viewArchived 
              ? "border-white text-white" 
              : "border-transparent text-zinc-400 hover:text-white"
          )}
        >
          <span>Active Shows</span>
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-bold",
            !viewArchived ? "bg-white text-black" : "bg-white/5 text-zinc-400"
          )}>
            {shows.filter(s => !s.archived).length}
          </span>
        </button>
        <button
          onClick={() => setViewArchived(true)}
          className={cn(
            "px-4 py-3 text-sm font-semibold border-b-2 transition-all relative flex items-center gap-2",
            viewArchived 
              ? "border-white text-white" 
              : "border-transparent text-zinc-400 hover:text-white"
          )}
        >
          <span>Archived Shows</span>
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-bold",
            viewArchived ? "bg-white text-black" : "bg-white/5 text-zinc-400"
          )}>
            {shows.filter(s => !!s.archived).length}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredShows.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-2xl">
            <Truck size={48} className="mx-auto mb-4 opacity-10" />
            <p className="text-zinc-500">No {viewArchived ? 'archived' : 'active'} shows found.</p>
          </div>
        ) : (
          filteredShows.map(show => (
            <div 
              key={show.id} 
              onClick={() => onViewDetails(show)}
              className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-6 hover:border-white/30 transition-all group cursor-pointer relative"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="text-xl font-bold">{show.name}</h3>
                  <p className="text-sm text-zinc-500">{show.client}</p>
                </div>
                <div className={cn(
                  "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full",
                  show.status === 'In Progress' ? "bg-blue-500/10 text-blue-500" : 
                  show.status === 'Completed' ? "bg-green-500/10 text-green-500" : "bg-zinc-500/10 text-zinc-500"
                )}>
                  {show.status}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-zinc-400">
                  <Calendar size={16} />
                  <span>{show.startDate} - {show.endDate}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-400">
                  <ClipboardList size={16} />
                  <span>{(show.pullSheet || []).length} items on pull sheet</span>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                <div className="flex gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      printPullSheet(show);
                    }}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-500 hover:text-white"
                    title="Print Pull Sheet"
                  >
                    <Printer size={16} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleArchive(show.id, !!show.archived);
                    }}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-500 hover:text-white"
                    title={show.archived ? "Restore Show to Active" : "Archive Show"}
                  >
                    <Archive size={16} className={show.archived ? "text-green-500" : ""} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(show);
                    }}
                    className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-zinc-500 hover:text-red-500"
                    title="Delete Show"
                  >
                    <X size={16} />
                  </button>
                </div>
                <button className="text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  View Details <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

function InventoryModal({ item, inventory, onClose, onSave }: { item: InventoryItem | null, inventory: InventoryItem[], onClose: () => void, onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: item?.name || '',
    category: item?.category || 'Sound',
    barcode: item?.barcode || '',
    quantity: item?.quantity || 1,
    availableQuantity: item?.availableQuantity || 1,
    location: item?.location || '',
    status: item?.status || 'Available',
    assetTags: item?.assetTags || [],
    imageUrl: item?.imageUrl || ''
  });

  const [newTag, setNewTag] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  const addTag = () => {
    const tag = newTag.trim();
    if (!tag) return;

    // Check if tag is already in this item's list
    if (formData.assetTags.includes(tag)) {
      setTagError('Tag already added to this item');
      return;
    }

    // Check if tag is used by ANY OTHER item in the inventory
    const usedBy = inventory.find(i => i.id !== item?.id && i.assetTags?.includes(tag));
    if (usedBy) {
      setTagError(`Conflict: Tag already assigned to "${usedBy.name}"`);
      return;
    }

    setFormData({
      ...formData,
      assetTags: [...formData.assetTags, tag]
    });
    setNewTag('');
    setTagError(null);
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      assetTags: formData.assetTags.filter(tag => tag !== tagToRemove)
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-white/10 flex justify-between items-center shrink-0">
          <h3 className="text-xl font-bold">{item ? 'Edit Item' : 'Add New Item'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg"><X size={20} /></button>
        </div>
        <form className="p-6 space-y-6 overflow-y-auto" onSubmit={(e) => { e.preventDefault(); onSave(formData); }}>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-24 h-24 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center overflow-hidden shrink-0 group relative">
                {formData.imageUrl ? (
                  <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <Camera size={24} className="text-zinc-600" />
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] text-white">
                  Change URL
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Image URL</label>
                <input 
                  type="url" 
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-4 focus:outline-none focus:border-white/30 text-sm"
                  placeholder="https://example.com/image.jpg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Item Name</label>
              <input 
                required
                type="text" 
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-4 focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Category</label>
                <select 
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg py-2 px-4 focus:outline-none focus:border-white/30 text-white [&>option]:bg-zinc-900 [&>option]:text-white"
                >
                  <option value="Sound">Sound</option>
                  <option value="Lighting">Lighting</option>
                  <option value="Scenic">Scenic</option>
                  <option value="Staging">Staging</option>
                  <option value="Trussing">Trussing</option>
                  <option value="Video">Video</option>
                  <option value="FX">FX</option>
                  <option value="Tools">Tools</option>
                  <option value="Other/Misc.">Other/Misc.</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Total Quantity</label>
                <input 
                  required
                  type="number" 
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value), availableQuantity: parseInt(e.target.value)})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-4 focus:outline-none focus:border-white/30"
                />
              </div>
            </div>

            {/* Asset Tags Section */}
            <div className="space-y-3 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Individual Asset Tags</label>
                  <p className="text-[10px] text-zinc-600 italic">Assign specific serial numbers to this group</p>
                </div>
                <span className="text-[10px] text-zinc-600 bg-white/5 px-2 py-1 rounded-full">{formData.assetTags.length} active</span>
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Scan or type next tag..."
                  className={cn(
                    "flex-1 bg-white/5 border border-white/10 rounded-lg py-2 px-4 focus:outline-none focus:border-white/30 text-sm font-mono",
                    tagError && "border-red-500/50 focus:border-red-500"
                  )}
                />
                <button 
                  type="button"
                  onClick={addTag}
                  className="px-4 bg-white text-black hover:bg-zinc-200 rounded-lg transition-colors font-bold text-xs"
                >
                  ADD
                </button>
              </div>
              {tagError && (
                <p className="text-[10px] text-red-400 font-medium px-1">{tagError}</p>
              )}
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-4 bg-black/20 rounded-xl border border-white/5">
                {formData.assetTags.length === 0 ? (
                  <div className="w-full py-4 text-center">
                    <Scan size={24} className="mx-auto opacity-10 mb-2" />
                    <p className="text-[10px] text-zinc-600 uppercase tracking-tighter">No units assigned</p>
                  </div>
                ) : (
                  formData.assetTags.map(tag => (
                    <div key={tag} className="flex items-center gap-2 bg-zinc-800 border border-white/10 pl-3 pr-2 py-1 rounded-full text-[10px] group hover:border-white/30 transition-colors">
                      <span className="font-mono text-zinc-400">#</span>
                      <span className="font-mono font-bold text-white tracking-widest">{tag}</span>
                      <button 
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="text-zinc-600 hover:text-red-400 transition-colors ml-1"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 shrink-0">
            <button type="submit" className="w-full py-3 bg-white text-black font-bold rounded-lg hover:bg-zinc-200 transition-colors shadow-lg shadow-white/5">
              {item ? 'Save Configuration' : 'Create Group Entry'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ShowModal({ onClose, onSave }: { onClose: () => void, onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    client: '',
    startDate: '',
    endDate: '',
    status: 'Draft',
    pullSheet: []
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <h3 className="text-xl font-bold">Create New Show</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg"><X size={20} /></button>
        </div>
        <form className="p-6 space-y-4" onSubmit={(e) => { e.preventDefault(); onSave(formData); }}>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Show Name</label>
            <input 
              required
              type="text" 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-4 focus:outline-none focus:border-white/30"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Client</label>
            <input 
              required
              type="text" 
              value={formData.client}
              onChange={(e) => setFormData({...formData, client: e.target.value})}
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-4 focus:outline-none focus:border-white/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Start Date</label>
              <input 
                required
                type="date" 
                value={formData.startDate}
                onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-4 focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">End Date</label>
              <input 
                required
                type="date" 
                value={formData.endDate}
                onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-4 focus:outline-none focus:border-white/30"
              />
            </div>
          </div>
          <div className="pt-4">
            <button type="submit" className="w-full py-3 bg-white text-black font-bold rounded-lg hover:bg-zinc-200 transition-colors">
              Create Show
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function DeleteConfirmationModal({ show, onClose, onConfirm }: { show: Show, onClose: () => void, onConfirm: (id: string) => void }) {
  const [confirmName, setConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showForceDelete, setShowForceDelete] = useState(false);
  
  const isMatch = confirmName.trim().toLowerCase() === show.name.trim().toLowerCase();

  useEffect(() => {
    let timer: any;
    if (isDeleting) {
      timer = setTimeout(() => {
        setShowForceDelete(true);
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [isDeleting]);

  const handleConfirm = async () => {
    if (!isMatch || isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirm(show.id);
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleForceDelete = () => {
    // Just close the modal and remove it locally
    onConfirm(show.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-red-500/20 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl shadow-red-500/5"
      >
        <div className="flex items-center gap-4 text-red-500">
          <div className="p-3 bg-red-500/10 rounded-xl">
            <AlertCircle size={24} />
          </div>
          <h3 className="text-xl font-bold">Delete Project?</h3>
        </div>

        <div className="space-y-4">
          <p className="text-zinc-400 text-sm leading-relaxed">
            This action is permanent. To confirm you want to delete <span className="text-white font-bold">"{show.name}"</span>, please type the project name below.
          </p>
          
          <div className="space-y-2">
            <input 
              type="text" 
              placeholder={show.name}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-red-500/50 transition-colors placeholder:opacity-30 text-white"
              autoFocus
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-lg font-bold transition-colors"
            >
              Cancel
            </button>
            <button 
              disabled={!isMatch || isDeleting}
              onClick={handleConfirm}
              className={cn(
                "flex-1 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2",
                isMatch 
                  ? "bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/20" 
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed",
                isDeleting && "opacity-50 cursor-wait"
              )}
            >
              {isDeleting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Project'
              )}
            </button>
          </div>
          
          {showForceDelete && (
            <button 
              onClick={handleForceDelete}
              className="w-full py-2 text-xs text-zinc-500 hover:text-white transition-colors underline"
            >
              Taking too long? Force delete locally
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ShowDetailsModal({ 
  show, 
  inventory, 
  onClose, 
  onAddItem,
  onUpdateDetails,
  onRemoveItem,
  onUpdateItem,
  showConfirm
}: { 
  show: Show | null, 
  inventory: InventoryItem[], 
  onClose: () => void, 
  onAddItem: (showId: string, itemId: string, quantity: number) => Promise<void>,
  onUpdateDetails?: (id: string, details: { name: string, client: string, startDate: string, endDate: string, status: 'Draft' | 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled' }) => Promise<void>,
  onRemoveItem: (showId: string, itemId: string) => Promise<void>,
  onUpdateItem: (showId: string, itemId: string, updates: { quantity?: number, scannedOut?: number, scannedIn?: number }) => Promise<void>,
  showConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info') => void
}) {
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: show?.name || '',
    client: show?.client || '',
    startDate: show?.startDate || '',
    endDate: show?.endDate || '',
    status: show?.status || 'Draft'
  });

  useEffect(() => {
    if (show) {
      setEditForm({
        name: show.name,
        client: show.client,
        startDate: show.startDate,
        endDate: show.endDate,
        status: show.status
      });
    }
  }, [show?.id, show?.name, show?.client, show?.startDate, show?.endDate, show?.status]);

  if (!show) return null;

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || isAdding) return;
    
    setIsAdding(true);
    try {
      await onAddItem(show.id, selectedItemId, quantity);
      setSelectedItemId('');
      setQuantity(1);
    } catch (error: any) {
      console.error("Failed to add item:", error);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {isEditing ? (
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              setIsSaving(true);
              try {
                if (onUpdateDetails) {
                  await onUpdateDetails(show.id, editForm as any);
                }
                setIsEditing(false);
              } catch (err) {
                console.error("Failed to update show:", err);
              } finally {
                setIsSaving(false);
              }
            }}
            className="p-6 border-b border-white/10 space-y-4 bg-white/[0.01]"
          >
            <div className="flex justify-between items-center mb-1">
              <h4 className="font-bold text-lg text-zinc-200">Edit Show Details</h4>
              <button 
                type="button" 
                onClick={() => setIsEditing(false)} 
                className="p-1 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Show Name</label>
                <input 
                  required
                  type="text" 
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:border-white/25 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Client Name</label>
                <input 
                  required
                  type="text" 
                  value={editForm.client}
                  onChange={(e) => setEditForm({...editForm, client: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:border-white/25 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Start Date</label>
                <input 
                  required
                  type="date" 
                  value={editForm.startDate}
                  onChange={(e) => setEditForm({...editForm, startDate: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:border-white/25 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">End Date</label>
                <input 
                  required
                  type="date" 
                  value={editForm.endDate}
                  onChange={(e) => setEditForm({...editForm, endDate: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:border-white/25 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Status</label>
                <select 
                  value={editForm.status}
                  onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:border-white/25 text-white"
                >
                  <option value="Draft">Draft</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1.5">
              <button 
                type="button" 
                onClick={() => setIsEditing(false)} 
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-white hover:bg-zinc-200 text-black rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              >
                {isSaving ? (
                  <div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    <Save size={13} />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-bold">{show.name}</h3>
                <p className="text-zinc-500">{show.client}</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsEditing(true)} 
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-zinc-300 hover:text-white border border-white/5 transition-colors"
                >
                  <Edit2 size={13} />
                  Edit Details
                </button>
                <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <div className="px-6 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1 font-mono">Dates</p>
                  <p className="text-sm font-medium">{show.startDate} to {show.endDate}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1 font-mono">Status</p>
                  <p className="text-sm font-medium">{show.status}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1 font-mono">Items</p>
                  <p className="text-sm font-medium">{(show.pullSheet || []).length} total assets</p>
                </div>
              </div>
            </div>
          </>
        )}
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h4 className="font-bold">Pull Sheet</h4>
              <form onSubmit={handleAddItem} className="flex items-center gap-2">
                <select 
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddItem(e as any);
                    }
                  }}
                  className="bg-zinc-800 border border-white/10 rounded-lg py-1 px-3 text-xs focus:outline-none focus:border-white/30 text-white [&>option]:bg-zinc-900 [&>option]:text-white"
                >
                  <option value="" className="bg-zinc-900 text-white">Add item...</option>
                  {[...inventory].sort((a, b) => a.name.localeCompare(b.name)).map(item => (
                    <option key={item.id} value={item.id} className="bg-zinc-900 text-white">
                      {item.name} ({item.availableQuantity} avail)
                    </option>
                  ))}
                </select>
                <input 
                  type="number" 
                  min="1"
                  value={isNaN(quantity) ? '' : quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setQuantity(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddItem(e as any);
                    }
                  }}
                  className="w-16 bg-white/5 border border-white/10 rounded-lg py-1 px-3 text-xs focus:outline-none focus:border-white/30"
                />
                <button 
                  type="submit"
                  onClick={(e) => {
                    // Ensure handleAddItem is called even if form submission doesn't trigger correctly
                    if (!selectedItemId) e.preventDefault();
                  }}
                  disabled={isAdding || !selectedItemId}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    isAdding || !selectedItemId 
                      ? "bg-zinc-800 text-zinc-600 cursor-not-allowed" 
                      : "bg-white text-black hover:bg-zinc-200"
                  )}
                >
                  {isAdding ? (
                    <div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                </button>
              </form>
            </div>
            <div className="bg-black/20 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 text-[10px] uppercase tracking-widest text-zinc-500">
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium w-24">Required</th>
                    <th className="px-4 py-3 font-medium w-24">Scanned Out</th>
                    <th className="px-4 py-3 font-medium w-24">Scanned In</th>
                    <th className="px-4 py-3 font-medium w-28">Status</th>
                    <th className="px-4 py-3 font-medium text-center w-16">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(show.pullSheet || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 text-sm italic">
                        No items added to pull sheet yet.
                      </td>
                    </tr>
                  ) : (
                    (show.pullSheet || []).map((item, idx) => {
                      const invItem = inventory.find(i => i.id === item.itemId);
                      return (
                        <tr key={idx} className="text-sm">
                          <td className="px-4 py-3">
                            <div className="font-medium">{invItem?.name || 'Unknown Item'}</div>
                            {invItem?.barcode && <div className="text-xs text-zinc-500 uppercase">{invItem.barcode}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={async (e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 1) {
                                  await onUpdateItem(show.id, item.itemId, { quantity: val });
                                }
                              }}
                              className="w-16 bg-white/5 hover:bg-white/10 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-white/35 text-center font-mono"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              value={item.scannedOut}
                              onChange={async (e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 0) {
                                  await onUpdateItem(show.id, item.itemId, { scannedOut: val });
                                }
                              }}
                              className="w-16 bg-white/5 hover:bg-white/10 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-white/35 text-center font-mono"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              value={item.scannedIn}
                              onChange={async (e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 0) {
                                  await onUpdateItem(show.id, item.itemId, { scannedIn: val });
                                }
                              }}
                              className="w-16 bg-white/5 hover:bg-white/10 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-white/35 text-center font-mono"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className={cn(
                              "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full w-fit",
                              item.scannedOut === item.quantity ? "bg-green-500/10 text-green-500" : "bg-zinc-500/10 text-zinc-500"
                            )}>
                              {item.scannedOut === item.quantity ? 'Ready' : 'Pending'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                showConfirm(
                                  "Remove Item from Pull Sheet?",
                                  `Are you sure you want to remove '${invItem?.name || 'this item'}' from the pull sheet?`,
                                  async () => {
                                    await onRemoveItem(show.id, item.itemId);
                                  },
                                  "danger"
                                );
                              }}
                              className="p-1.5 bg-red-500/5 hover:bg-red-500/15 text-red-400 rounded-lg transition-colors inline-block cursor-pointer border border-red-500/10"
                              title="Remove Item from Pull Sheet"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-white/10 flex justify-end gap-4">
          <button 
            onClick={() => {
              // Re-using the logic from ShowsView would be better as a shared utility, 
              // but for now we can trigger the window print or implement a similar helper
              const printWindow = window.open('', '_blank');
              if (!printWindow) return;
              
              const itemsHtml = show.pullSheet.map(item => {
                const invItem = inventory.find(i => i.id === item.itemId);
                return `
                  <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${invItem?.name || 'Unknown'}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${invItem?.barcode || 'N/A'}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; border-left: 1px solid #eee; width: 100px;"></td>
                  </tr>
                `;
              }).join('');

              printWindow.document.write(`
                <html>
                  <head>
                    <title>Pull Sheet - ${show.name}</title>
                    <style>
                      body { font-family: 'Inter', sans-serif; color: #333; padding: 40px; }
                      .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                      .company-info h1 { margin: 0; letter-spacing: 2px; }
                      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                      th { background: #f4f4f4; text-align: left; padding: 10px; border-bottom: 2px solid #ddd; }
                      .footer { margin-top: 50px; font-size: 12px; color: #666; text-align: center; }
                    </style>
                  </head>
                  <body>
                    <div class="header">
                      <div class="company-info">
                        <h1>SYNERGEO LOGISTICS</h1>
                        <p>Warehouse Operations | Pull Sheet</p>
                      </div>
                      <div style="text-align: right;">
                        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                      </div>
                    </div>
                    <h2>${show.name}</h2>
                    <p><strong>Client:</strong> ${show.client}</p>
                    <table>
                      <thead>
                        <tr>
                          <th>Equipment Name</th>
                          <th>Barcode</th>
                          <th style="text-align: center;">Qty Required</th>
                          <th>Checked Out By</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${itemsHtml}
                      </tbody>
                    </table>
                    <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };</script>
                  </body>
                </html>
              `);
              printWindow.document.close();
            }}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
          >
            <Printer size={16} />
            Print Pull Sheet
          </button>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-white text-black rounded-lg text-sm font-bold hover:bg-zinc-200 transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function SettingsView({ inventory, shows, onSync, onReset, showConfirm }: { inventory: InventoryItem[], shows: Show[], onSync: () => Promise<void>, onReset: () => Promise<void>, showConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info') => void }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [notifications, setNotifications] = useState({
    lowStock: true,
    maintenance: true
  });

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await onSync();
      showConfirm(
        "Sync Complete",
        "Inventory counts have been successfully synchronized with all active shows.",
        () => {},
        'info'
      );
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResetSystem = () => {
    showConfirm(
      "Reset All Data?",
      "Are you absolutely sure you want to delete all shows, scans, and restore the catalog back to factory defaults? This will erase all your current progress.",
      async () => {
        setIsResetting(true);
        try {
          await onReset();
          showConfirm(
            "System Reset Success",
            "Database has been restored to clean demo data successfully.",
            () => {},
            'info'
          );
        } catch (error) {
          console.error("Reset failed:", error);
        } finally {
          setIsResetting(false);
        }
      },
      'danger'
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto space-y-8"
    >
      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-zinc-500">Configure system preferences and perform maintenance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <Settings className="text-zinc-400" size={20} />
              <h3 className="font-bold">System Maintenance</h3>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Inventory Synchronization</p>
                <p className="text-xs text-zinc-500">
                  Recalculate all available quantities based on current non-archived shows. 
                  Use this if inventory counts seem inaccurate.
                </p>
              </div>
              
              <button 
                onClick={handleSync}
                disabled={isSyncing}
                className={cn(
                  "w-full py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2",
                  isSyncing ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-white text-black hover:bg-zinc-200"
                )}
              >
                {isSyncing ? (
                  <>
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    >
                      <Settings size={18} />
                    </motion.div>
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw size={18} />
                    Sync Inventory Counts
                  </>
                )}
              </button>

              <div className="pt-4 border-t border-white/5 space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-red-500">Factory Reset</p>
                  <p className="text-xs text-zinc-500">
                    Completely wipe all existing shows, scans, tracked items, and reset all inventory levels back to default demo values to start clean.
                  </p>
                </div>

                <button 
                  onClick={handleResetSystem}
                  disabled={isResetting || isSyncing}
                  className={cn(
                    "w-full py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 text-white",
                    isResetting ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-red-600 hover:bg-red-700 hover:shadow-lg hover:shadow-red-600/10"
                  )}
                >
                  {isResetting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={18} />
                      Reset System Data
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <Box className="text-zinc-400" size={20} />
              <h3 className="font-bold">Warehouse Info</h3>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-4 rounded-xl">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Total Assets</p>
                  <p className="text-xl font-bold">{inventory.length}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Active Shows</p>
                  <p className="text-xl font-bold">{shows.filter(s => !s.archived && s.status !== 'Cancelled').length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <AlertCircle className="text-zinc-400" size={20} />
              <h3 className="font-bold">Notifications</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Low Stock Alerts</span>
                <button 
                  onClick={() => setNotifications(prev => ({ ...prev, lowStock: !prev.lowStock }))}
                  className={cn(
                    "w-10 h-6 rounded-full relative transition-colors duration-200",
                    notifications.lowStock ? "bg-white" : "bg-zinc-800"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full transition-all duration-200",
                    notifications.lowStock ? "right-1 bg-black" : "left-1 bg-zinc-500"
                  )} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Maintenance Reminders</span>
                <button 
                  onClick={() => setNotifications(prev => ({ ...prev, maintenance: !prev.maintenance }))}
                  className={cn(
                    "w-10 h-6 rounded-full relative transition-colors duration-200",
                    notifications.maintenance ? "bg-white" : "bg-zinc-800"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full transition-all duration-200",
                    notifications.maintenance ? "right-1 bg-black" : "left-1 bg-zinc-500"
                  )} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ScannerView({ inventory, shows, onScan, showConfirm }: { inventory: InventoryItem[], shows: Show[], onScan: (showId: string, barcode: string, mode: 'out' | 'in') => Promise<{ success: boolean, message?: string, item?: InventoryItem, matchedTag?: string }>, showConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info') => void }) {
  const [scanInput, setScanInput] = useState('');
  const [lastScanned, setLastScanned] = useState<{ item: InventoryItem, tag: string } | null>(null);
  const [mode, setMode] = useState<'out' | 'in'>('out');
  const [selectedShow, setSelectedShow] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);

  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sound feedback utility using Web Audio API
  const playFeedback = useCallback((type: 'success' | 'error') => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'success') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      oscillator.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.1); // E6
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.2);
    } else {
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(220, audioCtx.currentTime); // A3
      oscillator.frequency.linearRampToValueAtTime(110, audioCtx.currentTime + 0.2); // A2
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    }
  }, []);

  // Keep input focused for HID scanners and prevent screen jump
  useEffect(() => {
    const focusInput = () => {
      // Only steal focus if the app container/document itself is actually focused,
      // and do so without triggering page scrolling/jumping.
      if (!document.hasFocus()) return;
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'SELECT') {
        inputRef.current?.focus({ preventScroll: true });
      }
    };

    // Initial focus
    focusInput();

    // Re-focus on container click
    const handleWindowClick = () => {
      // Only focus if our window/app actually holds focus
      if (document.hasFocus()) {
        focusInput();
      }
    };
    window.addEventListener('click', handleWindowClick);

    // Prevent default browser behavior for specific scanner keys if needed
    const handleKeyDown = (e: KeyboardEvent) => {
      // If the input is focused and the key is Enter, it's already handled by the form onSubmit
      // but we can add secondary checks here if the scanner is acting up.
    };
    window.addEventListener('keydown', handleKeyDown);

    const timer = setInterval(focusInput, 2000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleScan = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = scanInput.trim();
    if (!barcode) return;
    
    if (!selectedShow) {
      playFeedback('error');
      setStatusMessage({ text: "Please select a show first", type: 'error' });
      return;
    }

    const result = await onScan(selectedShow, barcode, mode);
    
    if (result.success && result.item) {
      playFeedback('success');
      setLastScanned({ item: result.item, tag: result.matchedTag || barcode });
      setStatusMessage({ 
        text: `Successfully scanned ${mode === 'out' ? 'OUT' : 'IN'}: ${result.item.name}`, 
        type: 'success' 
      });
    } else {
      playFeedback('error');
      setStatusMessage({ 
        text: result.message || "Scan failed", 
        type: 'error' 
      });
    }
    setScanInput('');
  }, [scanInput, selectedShow, mode, onScan, playFeedback]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-4xl mx-auto space-y-8"
    >
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-bold tracking-tight">Equipment Scanner</h2>
        <p className="text-zinc-500">Scan barcodes to check equipment in or out of the warehouse.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-8 space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex gap-4 p-1 bg-white/5 rounded-xl flex-1 mr-4">
                <button 
                  onClick={() => setMode('out')}
                  className={cn(
                    "flex-1 py-3 rounded-lg font-bold transition-all",
                    mode === 'out' ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-white"
                  )}
                >
                  Scan OUT
                </button>
                <button 
                  onClick={() => setMode('in')}
                  className={cn(
                    "flex-1 py-3 rounded-lg font-bold transition-all",
                    mode === 'in' ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-white"
                  )}
                >
                  Scan IN
                </button>
              </div>
              <div className="text-[10px] text-zinc-500 max-w-[120px] leading-tight">
                {mode === 'out' ? "Items must be on show's pull sheet to scan out." : "Returns items to available inventory."}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-sm font-medium text-zinc-400">Select Active Show</label>
              <select 
                value={selectedShow}
                onChange={(e) => setSelectedShow(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 focus:outline-none focus:border-white/30 text-white [&>option]:bg-zinc-900 [&>option]:text-white"
              >
                <option value="">Select a show...</option>
                {shows.filter(s => !s.archived && s.status !== 'Cancelled').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <form onSubmit={handleScan} className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-sm font-medium text-zinc-400">Barcode Input</label>
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Use VID-001, SND-001, etc.</span>
              </div>
              <div className="relative">
                <Scan className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={24} />
                <input 
                  ref={inputRef}
                  autoFocus
                  type="text" 
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Ready to scan..." 
                  className="w-full bg-white/10 border-2 border-white/20 rounded-xl py-6 pl-14 pr-4 text-2xl font-mono focus:outline-none focus:border-white transition-all placeholder:text-zinc-700"
                />
                <button 
                  type="submit"
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-white text-black px-4 py-2 rounded-lg font-bold hover:bg-zinc-200 transition-colors"
                >
                  Scan
                </button>
              </div>
              {statusMessage && (
                <motion.div 
                  key={statusMessage.text}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    "p-4 rounded-xl flex items-center gap-3 border",
                    statusMessage.type === 'success' ? "bg-green-500/10 text-green-500 border-green-500/20" : 
                    statusMessage.type === 'error' ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                  )}
                >
                  {statusMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                  <span className="text-sm font-bold">{statusMessage.text}</span>
                </motion.div>
              )}
              <div className="flex items-center justify-center gap-4 pt-2">
                <p className="text-xs text-zinc-500 italic">Scanner acts as keyboard input. Ensure field is focused.</p>
                <div className="h-1 w-1 rounded-full bg-zinc-800" />
                <p className="text-xs text-zinc-500">Barcode: <span className="text-zinc-400 font-mono">VID-001</span></p>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-6">
            <h3 className="font-bold border-b border-white/10 pb-4">Last Scanned</h3>
            {lastScanned ? (
              <motion.div 
                key={lastScanned.item.id + lastScanned.tag}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                <div className="w-full aspect-square bg-zinc-800 rounded-xl flex items-center justify-center relative overflow-hidden">
                  {lastScanned.item.imageUrl ? (
                    <img src={lastScanned.item.imageUrl} alt={lastScanned.item.name} className="w-full h-full object-cover" />
                  ) : (
                    <Box size={64} className="text-zinc-600" />
                  )}
                  <div className="absolute top-4 right-4 bg-white text-black px-2 py-1 rounded text-[10px] font-bold font-mono shadow-xl">
                    TAG: {lastScanned.tag}
                  </div>
                </div>
                <div>
                  <p className="text-lg font-bold">{lastScanned.item.name}</p>
                  <p className="text-sm text-zinc-500">{lastScanned.item.category}</p>
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle2 size={16} />
                  <span className="text-sm font-medium">Successfully Scanned {mode.toUpperCase()}</span>
                </div>
              </motion.div>
            ) : (
              <div className="py-12 text-center text-zinc-600 space-y-2">
                <Scan size={48} className="mx-auto opacity-20" />
                <p className="text-sm">Waiting for scan...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AssetTrackerView({ 
  inventory, 
  shows, 
  onQuickReturn,
  showConfirm
}: { 
  inventory: InventoryItem[], 
  shows: Show[], 
  onQuickReturn: (showId: string, itemId: string, quantity: number) => Promise<void> | void,
  showConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info') => void
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showFilter, setShowFilter] = useState('');
  const [onlyOutstanding, setOnlyOutstanding] = useState(true);
  const [adjustingItem, setAdjustingItem] = useState<{ showId: string, itemId: string, itemName: string, showName: string, maxOutstanding: number } | null>(null);
  const [adjustQty, setAdjustQty] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compile individual items on pull sheets across all shows
  const trackerItems = useMemo(() => {
    const list: {
      id: string;
      item: InventoryItem;
      show: Show;
      quantity: number;
      scannedOut: number;
      scannedIn: number;
      outstanding: number;
    }[] = [];

    shows.forEach(show => {
      if (show.status === 'Cancelled') return;
      
      const pullSheet = show.pullSheet || [];
      pullSheet.forEach(pullItem => {
        const item = inventory.find(i => i.id === pullItem.itemId);
        if (!item) return;

        const outstanding = Math.max(0, (pullItem.scannedOut || 0) - (pullItem.scannedIn || 0));

        list.push({
          id: `${show.id}-${item.id}`,
          item,
          show,
          quantity: pullItem.quantity || 0,
          scannedOut: pullItem.scannedOut || 0,
          scannedIn: pullItem.scannedIn || 0,
          outstanding
        });
      });
    });

    return list;
  }, [shows, inventory]);

  // Unique categories of scanned out pieces for filters
  const categories = useMemo(() => {
    const cats = new Set<string>();
    trackerItems.forEach(ti => {
      if (ti.item.category) cats.add(ti.item.category);
    });
    return Array.from(cats);
  }, [trackerItems]);

  // Unique active shows for filter
  const activeShowsForFilter = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    shows.forEach(s => {
      if (!s.archived && s.status !== 'Cancelled') {
        list.push({ id: s.id, name: s.name });
      }
    });
    return list;
  }, [shows]);

  // Handle Quick Adjust Submission
  const handleQuickAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItem) return;

    setIsSubmitting(true);
    try {
      await onQuickReturn(adjustingItem.showId, adjustingItem.itemId, adjustQty);
      setAdjustingItem(null);
    } catch (error) {
      console.error("Adjustment failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter items
  const filteredItems = useMemo(() => {
    return trackerItems.filter(item => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        item.item.name.toLowerCase().includes(q) ||
        (item.item.barcode || '').toLowerCase().includes(q) ||
        item.show.name.toLowerCase().includes(q) ||
        item.show.client.toLowerCase().includes(q);

      const matchesCategory = !categoryFilter || item.item.category === categoryFilter;
      const matchesShow = !showFilter || item.show.id === showFilter;
      const matchesOutstanding = !onlyOutstanding || item.outstanding > 0;

      return matchesSearch && matchesCategory && matchesShow && matchesOutstanding;
    });
  }, [trackerItems, searchQuery, categoryFilter, showFilter, onlyOutstanding]);

  // Overall Statistics
  const totalOutstandingQty = useMemo(() => {
    return trackerItems.reduce((acc, current) => acc + current.outstanding, 0);
  }, [trackerItems]);

  const uniqueOutstandingItems = useMemo(() => {
    const itemIds = new Set<string>();
    trackerItems.forEach(ti => {
      if (ti.outstanding > 0) {
        itemIds.add(ti.item.id);
      }
    });
    return itemIds.size;
  }, [trackerItems]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -25 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Global Asset Tracker</h2>
          <p className="text-zinc-400 text-sm">Monitor, trace, and quickly return all outbound warehouse assets across every project.</p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-zinc-50/0">
        <div className="bg-zinc-900/30 border border-white/5 p-5 rounded-2xl space-y-1">
          <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest block">Total Outstanding Units</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight font-mono text-amber-400">{totalOutstandingQty}</span>
            <span className="text-xs text-zinc-500">currently out</span>
          </div>
        </div>
        <div className="bg-zinc-900/30 border border-white/5 p-5 rounded-2xl space-y-1">
          <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest block">Unique Missing Assets</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight font-mono text-zinc-100">{uniqueOutstandingItems}</span>
            <span className="text-xs text-zinc-500">different products</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-zinc-500" size={16} />
            <input 
              type="text" 
              placeholder="Search by equipment, barcode, show or client..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950/60 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-white/30 text-white placeholder-zinc-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2 text-zinc-400 hover:text-white transition-colors text-xs font-bold"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Show Filter */}
            <select
              value={showFilter}
              onChange={(e) => setShowFilter(e.target.value)}
              className="bg-zinc-950/60 border border-white/10 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-white/30 text-white [&>option]:bg-zinc-900"
            >
              <option value="">All Shows</option>
              {activeShowsForFilter.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-zinc-950/60 border border-white/10 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-white/30 text-white [&>option]:bg-zinc-900"
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Outstanding Toggle Switch */}
            <label className="flex items-center gap-2 text-xs font-bold text-zinc-400 select-none cursor-pointer border border-white/10 rounded-lg px-3 py-2 bg-zinc-950/30 hover:bg-zinc-950/60 transition-colors">
              <input 
                type="checkbox" 
                checked={onlyOutstanding}
                onChange={(e) => setOnlyOutstanding(e.target.checked)}
                className="rounded border-white/10 bg-zinc-950 text-amber-500 focus:ring-0"
              />
              OUTSTANDING ONLY
            </label>
          </div>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-zinc-900/50 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 text-[11px] uppercase tracking-wider text-zinc-500 border-b border-white/5">
                <th className="px-6 py-4 font-semibold">Equipment Info</th>
                <th className="px-6 py-4 font-semibold font-sans">Project / Client</th>
                <th className="px-6 py-4 font-semibold font-sans">Required</th>
                <th className="px-6 py-4 font-semibold font-sans">Scanned Out</th>
                <th className="px-6 py-4 font-semibold font-sans">Scanned In</th>
                <th className="px-6 py-4 font-semibold font-sans text-amber-400">Outstanding</th>
                <th className="px-6 py-4 font-semibold text-right font-sans">Quick Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredItems.length === 0 ? (
                <tr>
                   <td colSpan={7} className="px-6 py-16 text-center text-zinc-500 text-sm">
                    <Activity size={36} className="mx-auto mb-4 opacity-10 animate-pulse text-amber-400" />
                    No tracked items found.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                          {item.item.imageUrl ? (
                            <img src={item.item.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Box size={14} className="text-zinc-600" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-zinc-100">{item.item.name}</div>
                          <div className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase mt-0.5">{item.item.category}{item.item.barcode ? ` • ${item.item.barcode}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-white">{item.show.name}</div>
                      <div className="text-xs text-zinc-500">{item.show.client}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-zinc-400">{item.quantity}</td>
                    <td className="px-6 py-4 font-mono text-sm text-zinc-300">{item.scannedOut}</td>
                    <td className="px-6 py-4 font-mono text-sm text-zinc-400">{item.scannedIn}</td>
                    <td className="px-6 py-4">
                      {item.outstanding > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                          {item.outstanding} Scanned Out
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold font-mono">
                          Fully Returned
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {item.outstanding > 0 ? (
                        <button 
                          onClick={() => {
                            setAdjustQty(item.outstanding);
                            setAdjustingItem({
                              showId: item.show.id,
                              itemId: item.item.id,
                              itemName: item.item.name,
                              showName: item.show.name,
                              maxOutstanding: item.outstanding
                            });
                          }}
                          className="text-xs font-bold bg-white text-black px-3 py-1.5 rounded hover:bg-zinc-200 transition-colors inline-flex items-center gap-1 shadow"
                        >
                          <RotateCcw size={12} />
                          Quick Return
                        </button>
                      ) : (
                        <span className="text-xs font-medium text-zinc-600 italic">No outstanding assets</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Outstanding / Return Mini Modal */}
      {adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900 border border-white/10 rounded-2xl max-w-sm w-full p-6 space-y-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <RotateCcw size={18} className="text-amber-400" />
                Quick Log Return
              </h3>
              <button 
                onClick={() => setAdjustingItem(null)} 
                className="text-zinc-500 hover:text-white transition-colors"
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleQuickAdjustSubmit} className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Equipment Item</p>
                <p className="text-sm font-semibold text-white">{adjustingItem.itemName}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Active Project / Show</p>
                <p className="text-sm font-semibold text-white">{adjustingItem.showName}</p>
              </div>

              <div className="space-y-1 bg-white/5 p-3 rounded-xl border border-white/10">
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest block mb-1">Scanned-Out Balance</p>
                <p className="text-sm font-bold text-amber-400 font-mono">
                  {adjustingItem.maxOutstanding} units outstanding
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest block">Number of Units to Return</label>
                <div className="flex gap-2">
                  <input 
                    required
                    type="number" 
                    min="1"
                    max={adjustingItem.maxOutstanding}
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(Math.min(adjustingItem.maxOutstanding, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="flex-1 bg-zinc-950 border border-white/10 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-white/30 text-center font-mono font-bold text-lg"
                  />
                  <button 
                    type="button"
                    onClick={() => setAdjustQty(adjustingItem.maxOutstanding)}
                    className="px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-xs font-bold transition-all"
                  >
                    Set Max
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setAdjustingItem(null)}
                  className="px-4 py-2 border border-white/10 hover:bg-white/5 text-white rounded-lg text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-white text-black hover:bg-zinc-200 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    <div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  ) : (
                    <>
                      <RotateCcw size={14} />
                      Log Returns
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function RoadCasesView({
  roadCases,
  inventory,
  onAdd,
  onUpdate,
  onDelete,
  showConfirm
}: {
  roadCases: RoadCase[],
  inventory: InventoryItem[],
  onAdd: (rc: Omit<RoadCase, 'id'>) => Promise<void> | void,
  onUpdate: (id: string, rc: Partial<RoadCase>) => Promise<void> | void,
  onDelete: (id: string) => Promise<void> | void,
  showConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info') => void
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<RoadCase | null>(null);
  
  // Modal states
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [newChildInput, setNewChildInput] = useState('');
  const [childBarcodes, setChildBarcodes] = useState<string[]>([]);

  // Bulk add text state (for quick list parsing)
  const [bulkInput, setBulkInput] = useState('');
  const [showBulkAdd, setShowBulkAdd] = useState(false);

  useEffect(() => {
    if (editingCase) {
      setName(editingCase.name);
      setBarcode(editingCase.barcode);
      setChildBarcodes(editingCase.childBarcodes || []);
    } else {
      setName('');
      setBarcode('');
      setChildBarcodes([]);
    }
    setBulkInput('');
    setShowBulkAdd(false);
  }, [editingCase, isModalOpen]);

  const filteredCases = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return roadCases;
    return roadCases.filter(rc => 
      rc.name.toLowerCase().includes(q) || 
      rc.barcode.toLowerCase().includes(q) ||
      (rc.childBarcodes && rc.childBarcodes.some(child => child.toLowerCase().includes(q)))
    );
  }, [roadCases, searchQuery]);

  const handleAddChild = () => {
    const trimmed = newChildInput.trim();
    if (!trimmed) return;
    if (childBarcodes.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setNewChildInput('');
      return; 
    }
    setChildBarcodes([...childBarcodes, trimmed]);
    setNewChildInput('');
  };

  const handleImportBulk = () => {
    if (!bulkInput.trim()) return;
    const lines = bulkInput
      .split(/[\n,]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    const uniqueNews = lines.filter(line => !childBarcodes.some(c => c.toLowerCase() === line.toLowerCase()));
    
    if (uniqueNews.length > 0) {
      setChildBarcodes([...childBarcodes, ...uniqueNews]);
    }
    setBulkInput('');
    setShowBulkAdd(false);
  };

  const handleRemoveChild = (tag: string) => {
    setChildBarcodes(childBarcodes.filter(c => c !== tag));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !barcode.trim()) return;

    const payload = {
      name: name.trim(),
      barcode: barcode.trim().toUpperCase(),
      childBarcodes
    };

    if (editingCase) {
      await onUpdate(editingCase.id, payload);
    } else {
      await onAdd(payload);
    }

    setIsModalOpen(false);
    setEditingCase(null);
  };

  const findItemForBarcode = (childBarcode: string) => {
    const trimmed = childBarcode.toLowerCase().trim();
    return inventory.find(i => 
      i.barcode.toLowerCase() === trimmed || 
      (i.assetTags && i.assetTags.some(tag => tag.toLowerCase() === trimmed))
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-6 max-w-7xl mx-auto pb-12"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Archive className="text-zinc-400" size={24} />
            Road Case Containers
          </h3>
          <p className="text-zinc-400 text-sm mt-1">
            Group individual asset barcodes under an exterior road case barcode to scan them together.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingCase(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-white text-black hover:bg-zinc-200 px-4 py-2 rounded-xl text-xs font-bold transition-all self-start sm:self-center cursor-pointer shadow-lg shadow-black/10"
        >
          <Plus size={16} />
          Create Road Case
        </button>
      </div>

      <div className="flex bg-white/5 p-4 rounded-2xl border border-white/10 items-center gap-3">
        <Search className="text-zinc-500" size={20} />
        <input 
          type="text"
          placeholder="Search road cases by name, case barcode, or contained items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent flex-1 focus:outline-none text-sm text-white placeholder-zinc-500"
        />
        {searchQuery && (
          <button 
            onClick={() => setSearchQuery('')}
            className="text-xs text-zinc-400 hover:text-white bg-white/5 px-2 py-1 rounded"
          >
            Clear
          </button>
        )}
      </div>

      {filteredCases.length === 0 ? (
        <div className="text-center py-16 bg-white/[0.02] border border-white/5 rounded-2xl">
          <Archive size={40} className="mx-auto text-zinc-650 mb-3 block" />
          <p className="text-zinc-400 text-sm font-medium">No road cases found</p>
          <p className="text-zinc-600 text-xs mt-1">
            {searchQuery ? "Try altering your search filters." : "Create your first road case to bundle asset barcodes."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredCases.map(rc => (
            <div 
              key={rc.id}
              className="bg-zinc-950 border border-white/10 rounded-2xl p-6 flex flex-col justify-between hover:border-white/20 transition-all shadow-xl"
            >
              <div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h4 className="text-lg font-bold text-white tracking-tight">{rc.name}</h4>
                    <span className="inline-block font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded text-zinc-400 font-semibold tracking-wider mt-1 uppercase">
                      CASE BARCODE: {rc.barcode}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => {
                        setEditingCase(rc);
                        setIsModalOpen(true);
                      }}
                      className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      title="Edit Road Case"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button 
                      onClick={() => {
                        showConfirm(
                          "Delete Road Case?",
                          `Are you sure you want to delete '${rc.name}'? The associated individual item barcodes will NOT be deleted from inventory.`,
                          () => onDelete(rc.id),
                          "danger"
                        );
                      }}
                      className="p-1.5 bg-white/5 hover:bg-red-500/10 hover:text-red-400 rounded-lg text-zinc-500 transition-colors cursor-pointer"
                      title="Delete Road Case"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-[10px] font-mono border-b border-white/5 pb-1.5">
                    <span className="text-zinc-500 uppercase tracking-wider font-bold">CONTAINED ASSET CODES</span>
                    <span className="text-zinc-400 font-bold">{rc.childBarcodes?.length || 0} ITEMS</span>
                  </div>
                  
                  {(!rc.childBarcodes || rc.childBarcodes.length === 0) ? (
                    <p className="text-xs text-zinc-650 italic text-center py-2">Empty road case container</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {rc.childBarcodes.map((childCode, idx) => {
                        const matchedItem = findItemForBarcode(childCode);
                        return (
                          <div 
                            key={idx} 
                            className="flex items-center justify-between text-xs py-1 px-2 hover:bg-white/5 rounded transition-all"
                          >
                            <span className="font-mono text-zinc-300 font-semibold">{childCode}</span>
                            {matchedItem ? (
                              <div className="flex items-center gap-2 text-right">
                                <span className="text-zinc-400 text-[11px] truncate max-w-[150px] sm:max-w-[180px]">
                                  {matchedItem.name}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium border ${
                                  matchedItem.status === 'Available' 
                                    ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/10'
                                    : matchedItem.status === 'Maintenance' 
                                    ? 'bg-amber-500/5 text-amber-400 border-amber-500/10'
                                    : 'bg-zinc-500/5 text-zinc-400 border-white/5'
                                }`}>
                                  {matchedItem.status}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-amber-400/95 font-semibold font-mono uppercase bg-amber-500/5 border border-amber-500/10 px-1.5 rounded tracking-wide">
                                ⚠️ Unknown Asset
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[10.5px] border-t border-white/5 pt-3 mt-4 text-zinc-500 flex items-center justify-between">
                <span>Created as a virtual logical box</span>
                <span className="font-semibold text-zinc-400 font-mono">STATUS: STACKABLE</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Case Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden flex flex-col my-8 shadow-2xl"
          >
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Archive size={18} className="text-zinc-400" />
                {editingCase ? "Edit Road Case" : "Register New Road Case"}
              </h3>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)} 
                className="p-1 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 flex-1">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">
                  Road Case / Container Name
                </label>
                <input 
                  required
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sharpies 200W Case 1"
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-white/25 text-white placeholder-zinc-650"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">
                  Exterior Box Barcode (External ID)
                </label>
                <input 
                  required
                  type="text" 
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="e.g. CASE-005"
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-white/25 text-white placeholder-zinc-650 font-mono uppercase"
                />
              </div>

              {/* Child Barcodes Block */}
              <div className="border border-white/5 rounded-xl p-4 bg-white/[0.01] space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">
                    Contained Asset Barcodes ({childBarcodes.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowBulkAdd(!showBulkAdd)}
                    className="text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-wider transition-colors bg-transparent border-0"
                  >
                    {showBulkAdd ? "Normal Add" : "Bulk Scan / Enter"}
                  </button>
                </div>

                {showBulkAdd ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-zinc-500 text-left">Paste multiple asset tags separated by commas or enters.</p>
                    <textarea 
                      placeholder="e.g.
vid-001-a
vid-001-b"
                      rows={4}
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-white/25 text-white placeholder-zinc-650 font-mono"
                    />
                    <div className="flex justify-end gap-2 bg-transparent">
                      <button
                        type="button"
                        onClick={() => setShowBulkAdd(false)}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-zinc-400 rounded text-[10px] font-semibold border-0"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleImportBulk}
                        className="px-3 py-1 bg-white text-black hover:bg-zinc-200 rounded text-[10px] font-bold border-0"
                      >
                        Parse & Add Tags
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={newChildInput}
                      onChange={(e) => setNewChildInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddChild();
                        }
                      }}
                      placeholder="Scan or type asset tag..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg py-1.5 px-3 text-xs focus:outline-none focus:border-white/25 text-white font-mono"
                    />
                    <button 
                      type="button"
                      onClick={handleAddChild}
                      className="px-3 bg-white/10 hover:bg-white/15 hover:text-white text-zinc-300 rounded-lg text-xs font-bold border border-white/10 transition-colors cursor-pointer h-8"
                    >
                      Add
                    </button>
                  </div>
                )}

                {childBarcodes.length === 0 ? (
                  <p className="text-zinc-600 italic text-center py-4 text-xs">No asset barcodes assigned to this road case yet</p>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1 bg-zinc-950 p-2.5 rounded-lg border border-white/5">
                    {childBarcodes.map((tag, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-1 px-1.5 hover:bg-white/5 rounded">
                        <span className="font-mono text-zinc-300 font-semibold">{tag}</span>
                        <button 
                          type="button" 
                          onClick={() => handleRemoveChild(tag)}
                          className="text-[10px] text-zinc-650 hover:text-red-400 transition-all px-1 cursor-pointer bg-transparent border-0"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-white/5 flex justify-end gap-3 bg-transparent">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 bg-white text-black hover:bg-zinc-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-lg shadow-black/10"
                >
                  <Save size={13} />
                  {editingCase ? "Save Road Case" : "Register Case"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
