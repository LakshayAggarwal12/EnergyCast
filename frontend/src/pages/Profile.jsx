import { useAuth } from "../context/AuthContext";
import { Card, Button } from "../components/ui";
import { User, Mail, Shield, Key } from "lucide-react";
import { useState } from "react";

export default function Profile() {
  const { user, logout } = useAuth();
  const [isHovered, setIsHovered] = useState(false);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
      <h1 className="text-2xl font-bold mb-6 text-foreground flex items-center gap-2">
        <User className="text-accent w-6 h-6" /> User Profile
      </h1>

      <Card className="hover:shadow-lg transition-shadow duration-300">
        <div className="flex items-center gap-6 mb-8 pb-8 border-b border-line relative overflow-hidden">
          <div 
            className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center text-accent text-3xl font-bold transition-transform duration-300"
            style={{ transform: isHovered ? "scale(1.05)" : "scale(1)" }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {user.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-semibold">{user.name}</h2>
            <div className="flex items-center gap-2 text-muted mt-1 text-sm">
              <Mail className="w-4 h-4" /> {user.email}
            </div>
            <div className="flex items-center gap-2 text-muted mt-1 text-sm">
              <Shield className="w-4 h-4" /> Role: <span className="uppercase text-accent font-medium">{user.role}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Key className="w-5 h-5 text-muted" /> Account Security
          </h3>
          <p className="text-sm text-muted">Your account is secured with email and password authentication.</p>
          <div className="pt-4">
            <Button variant="danger" onClick={logout} className="transition-transform hover:scale-105">
              Sign out
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
