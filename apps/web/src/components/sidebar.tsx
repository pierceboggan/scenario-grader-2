'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  PlayCircle, 
  FileText, 
  Settings,
  TestTube2,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Scenarios', href: '/scenarios', icon: TestTube2 },
  { name: 'Runs', href: '/runs', icon: PlayCircle },
  { name: 'Reports', href: '/reports', icon: FileText },
];

const secondaryNavigation = [
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <TestTube2 className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Scenario Runner</span>
          <span className="text-xs text-muted-foreground">VS Code Testing</span>
        </div>
      </div>

      <Separator />

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/' && pathname.startsWith(item.href));
            
            return (
              <Link key={item.name} href={item.href}>
                <Button
                  variant={isActive ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start gap-3',
                    isActive && 'bg-secondary'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                  {isActive && (
                    <ChevronRight className="ml-auto h-4 w-4" />
                  )}
                </Button>
              </Link>
            );
          })}
        </nav>

        <Separator className="my-4" />

        <nav className="space-y-1">
          {secondaryNavigation.map((item) => {
            const isActive = pathname === item.href;
            
            return (
              <Link key={item.name} href={item.href}>
                <Button
                  variant={isActive ? 'secondary' : 'ghost'}
                  className="w-full justify-start gap-3"
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Button>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-4">
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <span className="text-xs font-medium">VS</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">VS Code Insiders</p>
            <p className="text-xs text-muted-foreground">Connected</p>
          </div>
          <div className="h-2 w-2 rounded-full bg-green-500" />
        </div>
      </div>
    </div>
  );
}
