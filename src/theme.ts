import { createTheme } from "@mui/material/styles";
import { inter } from "./fonts";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      light: "#4a7a54",
      main: "#35603f",
      dark: "#2c4f34",
      contrastText: "#ffffff",
    },
    secondary: {
      light: "#ff7a45",
      main: "#fc4c02",
      dark: "#9c3000",
      contrastText: "#ffffff",
    },
    background: {
      default: "#f4f6f1",
      paper: "#ffffff",
    },
    text: {
      primary: "#1c231d",
      secondary: "#4b5449",
    },
    divider: "#d7dbce",
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: inter.style.fontFamily,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 24,
          textTransform: "none",
          fontWeight: 700,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 700,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
  },
});

export default theme;
