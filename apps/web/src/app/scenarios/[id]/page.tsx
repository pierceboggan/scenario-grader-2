'use client';

import { use } from 'react';
import { Header } from '@/components/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  PlayCircle,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  FileCode,
  Edit,
  Copy,
  Trash2,
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';

// Mock data - would be fetched by ID
const scenarioData = {
  id: 'copilot-chat-code-generation',
  name: 'Copilot Chat Code Generation',
  description: 'Test Copilot code generation through the chat interface. This scenario verifies that Copilot can generate code based on natural language prompts.',
  version: '1.0.0',
  author: 'VS Code Team',
  createdAt: '2024-01-15',
  lastModified: '2024-01-20',
  tags: ['copilot', 'chat', 'code-generation'],
  steps: [
    { id: 1, action: 'openFile', description: 'Open a new TypeScript file', status: 'passed' },
    { id: 2, action: 'openPanel', description: 'Open Copilot Chat panel', status: 'passed' },
    { id: 3, action: 'sendMessage', description: 'Send a code generation prompt', status: 'passed' },
    { id: 4, action: 'waitForResponse', description: 'Wait for Copilot response', status: 'passed' },
    { id: 5, action: 'verifyOutput', description: 'Verify generated code is valid', status: 'failed' },
  ],
  recentRuns: [
    { id: '1', status: 'passed', duration: '32s', time: '2 hours ago' },
    { id: '2', status: 'failed', duration: '45s', time: '5 hours ago' },
    { id: '3', status: 'passed', duration: '28s', time: '1 day ago' },
  ],
  stats: {
    totalRuns: 24,
    passRate: '87%',
    avgDuration: '34s',
    lastRun: '2 hours ago'
  }
};

export default function ScenarioDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = use(params);
  // In real app, fetch scenario by id
  const scenario = scenarioData;

  return (
    <div className="flex flex-col">
      <Header 
        title={scenario.name}
        description={scenario.description}
        breadcrumb={
          <Link href="/scenarios" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Scenarios
          </Link>
        }
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button>
              <PlayCircle className="mr-2 h-4 w-4" />
              Run Scenario
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Steps */}
            <Card>
              <CardHeader>
                <CardTitle>Steps</CardTitle>
                <CardDescription>
                  {scenario.steps.length} steps in this scenario
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {scenario.steps.map((step, index) => (
                    <div key={step.id}>
                      <div className="flex items-center gap-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-muted px-2 py-1 text-sm">
                              {step.action}
                            </code>
                            {step.status === 'passed' && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                            {step.status === 'failed' && (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {step.description}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      {index < scenario.steps.length - 1 && (
                        <div className="ml-4 mt-4 h-4 border-l-2 border-dashed border-muted" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Runs */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Recent Runs</CardTitle>
                    <CardDescription>Latest execution history</CardDescription>
                  </div>
                  <Link href={`/runs?scenario=${id}`}>
                    <Button variant="outline" size="sm">View All</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {scenario.recentRuns.map((run) => (
                    <Link 
                      key={run.id}
                      href={`/runs/${run.id}`}
                      className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        {run.status === 'passed' ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                        <span className="text-sm">{run.time}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={run.status === 'passed' ? 'default' : 'destructive'}>
                          {run.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{run.duration}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Runs</span>
                  <span className="font-medium">{scenario.stats.totalRuns}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Pass Rate</span>
                  <Badge>{scenario.stats.passRate}</Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Avg Duration</span>
                  <span className="font-medium">{scenario.stats.avgDuration}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last Run</span>
                  <span className="font-medium">{scenario.stats.lastRun}</span>
                </div>
              </CardContent>
            </Card>

            {/* Metadata */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-sm text-muted-foreground">Version</span>
                  <p className="font-medium">{scenario.version}</p>
                </div>
                <Separator />
                <div>
                  <span className="text-sm text-muted-foreground">Author</span>
                  <p className="font-medium">{scenario.author}</p>
                </div>
                <Separator />
                <div>
                  <span className="text-sm text-muted-foreground">Tags</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {scenario.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate Scenario
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <FileCode className="mr-2 h-4 w-4" />
                  View YAML
                </Button>
                <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Scenario
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
