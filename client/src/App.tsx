import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { ClerkProvider, SignIn } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Methodologie from "@/pages/Methodologie";
import NotFound from "@/pages/not-found";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#1e594a",
    colorForeground: "#17483d",
    colorMutedForeground: "#557067",
    colorDanger: "#a34d3e",
    colorBackground: "#fffef9",
    colorInput: "#faf9f3",
    colorInputForeground: "#17483d",
    colorNeutral: "#d9ddd1",
    fontFamily: '"DM Sans", sans-serif',
    borderRadius: "14px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#fffef9] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#d9ddd1]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#17483d] font-serif",
    headerSubtitle: "text-[#557067]",
    socialButtonsBlockButtonText: "text-[#17483d]",
    formFieldLabel: "text-[#17483d]",
    footerActionLink: "text-[#1e594a]",
    footerActionText: "text-[#557067]",
    dividerText: "text-[#557067]",
    formButtonPrimary: "bg-[#1e594a] hover:bg-[#17483d]",
    formFieldInput: "bg-[#faf9f3] text-[#17483d] border-[#d9ddd1]",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f5f5ed] px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/methodologie" component={Methodologie} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      localization={{
        signIn: { start: { title: "ALi administration", subtitle: "Sign in to manage the Harness" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function AppWithRouter() {
  return <WouterRouter base={basePath}><App /></WouterRouter>;
}

export default AppWithRouter;
