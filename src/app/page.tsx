import { AuthProvider } from "@/components/AuthProvider";
import { Home } from "@/components/Home";

export default function Page() {
  return (
    <AuthProvider>
      <Home />
    </AuthProvider>
  );
}
