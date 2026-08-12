import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * I colori KaiPai, in due temi.
 *
 * I nomi non descrivono un colore ma un **ruolo**: `ink` è lo sfondo della
 * pagina, `hi` il testo che si legge per primo, `line` il confine fra due
 * superfici. È ciò che permette a una schermata sola di funzionare in chiaro e
 * in scuro senza un solo `if` sparso nel codice — cambia la palette, non le
 * schermate.
 *
 * Il rosso resta lo stesso nei due temi: è il marchio, non un colore
 * d'interfaccia, e un rosso che cambia tono fra chiaro e scuro non sembra più
 * lo stesso prodotto.
 */
export type Palette = {
  ink: string;
  ink2: string;
  surface: string;
  line: string;
  hi: string;
  mid: string;
  low: string;
  red: string;
  red2: string;
  /**
   * Il verde di «aggiungi».
   *
   * Il rosso e` il marchio, e nel prodotto marca anche cio` che e` in corso
   * o irreversibile: registrazione attiva, chiudi, annulla. Un «+» rosso
   * chiedeva attenzione con lo stesso tono di un allarme, per il gesto piu`
   * innocuo della schermata.
   */
  green: string;
};

const dark: Palette = {
  ink: '#050507',
  ink2: '#101015',
  surface: '#16161c',
  line: '#26262e',
  hi: '#f5f5f7',
  mid: '#a1a1ab',
  low: '#6b6b76',
  red: '#e11d2a',
  red2: '#f5333f',
  green: '#12a150',
};

/*
 * Il chiaro non è lo scuro invertito.
 *
 * Ribaltare i valori dà grigi sporchi e un bianco che abbaglia: qui lo sfondo
 * è un bianco appena caldo, le superfici scendono di un gradino invece di
 * salire, e il testo secondario resta abbastanza scuro da leggersi al sole —
 * che è la condizione in cui il tema chiaro serve davvero.
 */
const light: Palette = {
  ink: '#fbfbfc',
  ink2: '#ffffff',
  surface: '#f2f2f5',
  line: '#e0e0e6',
  hi: '#121216',
  mid: '#5c5c66',
  low: '#8a8a95',
  red: '#c8101d',
  red2: '#e11d2a',
  green: '#0f8a44',
};

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'kaipai.theme';

type ThemeValue = {
  theme: Palette;
  /** Cosa ha scelto la persona, che non è sempre cosa si vede. */
  mode: ThemeMode;
  /** Cosa si vede davvero, dopo aver risolto «sistema». */
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeValue>({
  theme: dark,
  mode: 'system',
  resolved: 'dark',
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // La preferenza si rilegge all'avvio. Finché non è arrivata si usa il
  // sistema: è la scelta che ha più probabilità di essere già quella giusta.
  useEffect(() => {
    void SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored);
      }
    });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {
      // Il tema resta applicato per questa sessione anche se non si salva:
      // un errore di archiviazione non deve togliere il controllo.
    });
  }, []);

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;

  const value = useMemo(
    () => ({
      theme: resolved === 'light' ? light : dark,
      mode,
      resolved,
      setMode,
    }),
    [mode, resolved, setMode]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/**
 * Il tema scuro come valore statico.
 *
 * Serve solo dove un colore va scelto fuori da un componente React — per
 * esempio nella configurazione della barra di stato prima che il provider
 * esista. Nelle schermate si usa `useTheme`, altrimenti il tema chiaro non
 * arriverebbe mai.
 */
export const staticDark = dark;
