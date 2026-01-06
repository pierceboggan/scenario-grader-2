'use client';

import { use } from 'react';
import { Header } from '@/components/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { 
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  PlayCircle,
  Terminal,
  ImageIcon,
  ChevronDown,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

// Mock data
const runData = {
  id: '1',
  scenarioId: 'copilot-chat-code-generation',
  scenarioName: 'Copilot Chat Code Generation',
  status: 'passed',
  startTime: '2024-01-20 14:30:15',
  endTime: '2024-01-20 14:30:47',
  duration: '32s',
  environment: {
    vsCodeVersion: '1.85.0',
    os: 'macOS 14.2',
    profile: 'default'
  },
  steps: [
    { 
      id: 1, 
      action: 'openFile', 
      description: 'Open a new TypeScript file',
      status: 'passed',
      duration: '2.3s',
      startTime: '14:30:15',
      logs: ['Creating new file: test.ts', 'File opened successfully'],
      screenshot: '/screenshots/step1.png'
    },
    { 
      id: 2, 
      action: 'openPanel', 
      description: 'Open Copilot Chat panel',
      status: 'passed',
      duration: '1.8s',
      startTime: '14:30:17',
      logs: ['Opening panel: copilot-chat', 'Panel visible'],
      screenshot: '/screenshots/step2.png'
    },
    { 
      id: 3, 
      action: 'sendMessage', 
      description: 'Send a code generation prompt',
      status: 'passed',
      duration: '3.2s',
      startTime: '14:30:19',
      logs: ['Sending message: "Write a function to calculate fibonacci"', 'Message sent'],
      screenshot: '/screenshots/step3.png'
    },
    { 
      id: 4, 
      action: 'waitForResponse', 
      description: 'Wait for Copilot response',
      status: 'passed',
      duration: '18.5s',
      startTime: '14:30:22',
      logs: ['Waiting for response...', 'Response received: 284 characters'],
      screenshot: '/screenshots/step4.png'
    },
    { 
      id: 5, 
      action: 'verifyOutput', 
      description: 'Verify generated code is valid',
      status: 'passed',
      duration: '4.1s',
      startTime: '14:30:41',
      logs: ['Checking for function declaration', 'Found: function fibonacci(n)', 'Validation passed'],
      screenshot: '/screenshots/step5.png'
    },
  ]
};

export default function RunDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id: _id } = use(params);
  const [expandedSteps, setExpandedSteps] = useState<number[]>([]);
  const [brokenScreenshots, setBrokenScreenshots] = useState<Record<number, boolean>>({});
  
  // In real app, fetch run by id using _id
  const run = runData;

  const toggleStep = (stepId: number) => {
    setExpandedSteps(prev => 
      prev.includes(stepId) 
        ? prev.filter(s => s !== stepId)
        : [...prev, stepId]
    );
  };

  const passedSteps = run.steps.filter(s => s.status === 'passed').length;
  const progress = (passedSteps / run.steps.length) * 100;

  return (
    <div className="flex flex-col">
      <Header 
        title={`Run #${run.id}`}
        description={run.scenarioName}
        breadcrumb={
          <Link href="/runs" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Runs
          </Link>
        }
        action={
          <div className="flex gap-2">
            <Link href={`/scenarios/${run.scenarioId}`}>
              <Button variant="outline" size="sm">
                View Scenario
              </Button>
            </Link>
            <Button>
              <RefreshCw className="mr-2 h-4 w-4" />
              Re-run
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Progress Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {run.status === 'passed' ? (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                        <CheckCircle2 className="h-6 w-6 text-green-500" />
                      </div>
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                        <XCircle className="h-6 w-6 text-red-500" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-lg">
                        {run.status === 'passed' ? 'All Steps Passed' : 'Run Failed'}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {passedSteps} of {run.steps.length} steps completed
                      </p>
                    </div>
                  </div>
                  <Badge 
                    variant={run.status === 'passed' ? 'default' : 'destructive'}
                    className="text-sm"
                  >
                    {run.status}
                  </Badge>
                </div>
                <Progress value={progress} className="h-2" />
              </CardContent>
            </Card>

            {/* Steps */}
            <Card>
              <CardHeader>
                <CardTitle>Execution Steps</CardTitle>
                <CardDescription>
                  Detailed breakdown of each step
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {run.steps.map((step) => {
                    const isExpanded = expandedSteps.includes(step.id);
                    return (
                      <div key={step.id} className="rounded-lg border">
                        <button
                          onClick={() => toggleStep(step.id)}
                          className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
                              {step.id}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <code className="rounded bg-muted px-2 py-0.5 text-sm">
                                  {step.action}
                                </code>
                                {step.status === 'passed' ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {step.description}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-muted-foreground">{step.duration}</span>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </button>
                        
                        {isExpanded && (
                          <div className="border-t px-4 py-4 bg-muted/30">
                            <div className="grid gap-4 md:grid-cols-2">
                              {/* Logs */}
                              <div>
                                <h4 className="flex items-center gap-2 text-sm font-medium mb-2">
                                  <Terminal className="h-4 w-4" />
                                  Logs
                                </h4>
                                <div className="rounded-md bg-zinc-900 p-3">
                                  <pre className="text-xs text-zinc-300 font-mono">
                                    {step.logs.join('\n')}
                                  </pre>
                                </div>
                              </div>
                              
                              {/* Screenshot placeholder */}
                              <div>
                                <h4 className="flex items-center gap-2 text-sm font-medium mb-2">
                                  <ImageIcon className="h-4 w-4" />
                                  Screenshot
                                </h4>
                                {step.screenshot && !brokenScreenshots[step.id] ? (
                                  <img
                                    src={step.screenshot}
                                    alt={`Step ${step.id} screenshot`}
                                    className="rounded-md object-contain max-h-64 w-full"
                                    onError={() => setBrokenScreenshots(prev => ({ ...prev, [step.id]: true }))}
                                  />
                                ) : (
                                  <div className="rounded-md bg-muted h-32 flex items-center justify-center text-muted-foreground text-sm">
                                    Screenshot not available
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Run Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Run Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Started</span>
                  <span className="text-sm font-medium">{run.startTime}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Finished</span>
                  <span className="text-sm font-medium">{run.endTime}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Duration</span>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{run.duration}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Environment */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Environment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-sm text-muted-foreground">VS Code Version</span>
                  <p className="font-medium">{run.environment.vsCodeVersion}</p>
                </div>
                <Separator />
                <div>
                  <span className="text-sm text-muted-foreground">Operating System</span>
                  <p className="font-medium">{run.environment.os}</p>
                </div>
                <Separator />
                <div>
                  <span className="text-sm text-muted-foreground">Profile</span>
                  <p className="font-medium">{run.environment.profile}</p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Run Again
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Terminal className="mr-2 h-4 w-4" />
                  Download Logs
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
