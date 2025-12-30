import { Header } from '@/components/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  PlayCircle,
  TrendingUp,
  Activity,
  TestTube2
} from 'lucide-react';
import Link from 'next/link';

// Mock data - will be replaced with real API calls
const stats = [
  { name: 'Total Scenarios', value: '12', icon: TestTube2, change: '+2 this week' },
  { name: 'Pass Rate', value: '87%', icon: TrendingUp, change: '+5% from last run' },
  { name: 'Total Runs', value: '156', icon: Activity, change: '24 today' },
  { name: 'Avg Duration', value: '45s', icon: Clock, change: '-12s improvement' },
];

const recentRuns = [
  { id: '1', scenario: 'Copilot Chat Basic', status: 'passed', duration: '32s', time: '2 min ago' },
  { id: '2', scenario: 'Extension Install', status: 'failed', duration: '58s', time: '15 min ago' },
  { id: '3', scenario: 'Command Palette', status: 'passed', duration: '21s', time: '1 hour ago' },
  { id: '4', scenario: 'MCP Config', status: 'passed', duration: '47s', time: '2 hours ago' },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col">
      <Header 
        title="Dashboard" 
        description="Monitor your scenario testing at a glance"
        action={
          <Link href="/scenarios">
            <Button>
              <PlayCircle className="mr-2 h-4 w-4" />
              Run All Scenarios
            </Button>
          </Link>
        }
      />
      
      <div className="flex-1 space-y-6 p-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.name}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.name}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.change}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Runs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Runs</CardTitle>
                <CardDescription>Your latest scenario executions</CardDescription>
              </div>
              <Link href="/runs">
                <Button variant="outline" size="sm">View All</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentRuns.map((run) => (
                <div 
                  key={run.id}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    {run.status === 'passed' ? (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                        <XCircle className="h-5 w-5 text-red-500" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{run.scenario}</p>
                      <p className="text-sm text-muted-foreground">{run.time}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={run.status === 'passed' ? 'default' : 'destructive'}>
                      {run.status}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{run.duration}</span>
                    <Link href={`/runs/${run.id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <Link href="/scenarios/new">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TestTube2 className="h-5 w-5" />
                  Create Scenario
                </CardTitle>
                <CardDescription>
                  Build a new test scenario with YAML or natural language
                </CardDescription>
              </CardHeader>
            </Link>
          </Card>
          
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <Link href="/runs">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-5 w-5" />
                  View Analytics
                </CardTitle>
                <CardDescription>
                  Analyze trends and identify flaky scenarios
                </CardDescription>
              </CardHeader>
            </Link>
          </Card>
          
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <Link href="/settings">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-5 w-5" />
                  Schedule Runs
                </CardTitle>
                <CardDescription>
                  Set up automated scenario execution
                </CardDescription>
              </CardHeader>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
