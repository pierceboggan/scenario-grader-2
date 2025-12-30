'use client';

import { Header } from '@/components/header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CheckCircle2,
  XCircle,
  Clock,
  FileCode,
  Filter
} from 'lucide-react';
import Link from 'next/link';

// Mock data
const runs = [
  { 
    id: '1', 
    scenarioId: 'copilot-chat-code-generation',
    scenarioName: 'Copilot Chat Code Generation',
    status: 'passed', 
    duration: '32s', 
    time: '2024-01-20 14:30',
    stepsTotal: 5,
    stepsPassed: 5
  },
  { 
    id: '2', 
    scenarioId: 'extension-install-marketplace',
    scenarioName: 'Extension Install from Marketplace',
    status: 'failed', 
    duration: '58s', 
    time: '2024-01-20 14:15',
    stepsTotal: 4,
    stepsPassed: 2
  },
  { 
    id: '3', 
    scenarioId: 'mcp-config-github-registry',
    scenarioName: 'MCP Config from GitHub Registry',
    status: 'passed', 
    duration: '47s', 
    time: '2024-01-20 13:00',
    stepsTotal: 6,
    stepsPassed: 6
  },
  { 
    id: '4', 
    scenarioId: 'copilot-chat-code-generation',
    scenarioName: 'Copilot Chat Code Generation',
    status: 'passed', 
    duration: '28s', 
    time: '2024-01-20 12:45',
    stepsTotal: 5,
    stepsPassed: 5
  },
  { 
    id: '5', 
    scenarioId: 'extension-install-marketplace',
    scenarioName: 'Extension Install from Marketplace',
    status: 'passed', 
    duration: '52s', 
    time: '2024-01-20 11:30',
    stepsTotal: 4,
    stepsPassed: 4
  },
];

export default function RunsPage() {
  return (
    <div className="flex flex-col">
      <Header 
        title="Run History" 
        description="View all scenario execution results"
        action={
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
        }
      />

      <div className="flex-1 space-y-6 p-6">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All Runs</TabsTrigger>
            <TabsTrigger value="passed">Passed</TabsTrigger>
            <TabsTrigger value="failed">Failed</TabsTrigger>
          </TabsList>
          
          <TabsContent value="all" className="mt-6">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Scenario</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Steps</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {run.status === 'passed' ? (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              </div>
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10">
                                <XCircle className="h-4 w-4 text-red-500" />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                              <FileCode className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                              <Link 
                                href={`/scenarios/${run.scenarioId}`}
                                className="font-medium hover:underline"
                              >
                                {run.scenarioName}
                              </Link>
                              <p className="text-sm text-muted-foreground">
                                Run #{run.id}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {run.time}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={run.stepsPassed === run.stepsTotal ? 'default' : 'secondary'}
                          >
                            {run.stepsPassed}/{run.stepsTotal} passed
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{run.duration}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/runs/${run.id}`}>
                            <Button size="sm" variant="ghost">View Details</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="passed" className="mt-6">
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Passed runs will appear here
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="failed" className="mt-6">
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Failed runs will appear here
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
