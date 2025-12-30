'use client';

import { useState } from 'react';
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
  PlayCircle,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  FileCode,
  MoreHorizontal
} from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Mock data
const scenarios = [
  { 
    id: 'copilot-chat-code-generation',
    name: 'Copilot Chat Code Generation',
    description: 'Test Copilot code generation through the chat interface',
    steps: 5,
    lastRun: '2 hours ago',
    lastStatus: 'passed',
    passRate: '95%',
    avgDuration: '32s'
  },
  { 
    id: 'extension-install-marketplace',
    name: 'Extension Install from Marketplace',
    description: 'Verify extension installation workflow from marketplace',
    steps: 4,
    lastRun: '15 min ago',
    lastStatus: 'failed',
    passRate: '78%',
    avgDuration: '58s'
  },
  { 
    id: 'mcp-config-github-registry',
    name: 'MCP Config from GitHub Registry',
    description: 'Test MCP server configuration from GitHub registry',
    steps: 6,
    lastRun: '1 day ago',
    lastStatus: 'passed',
    passRate: '92%',
    avgDuration: '47s'
  },
];

export default function ScenariosPage() {
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);

  const toggleScenario = (id: string) => {
    setSelectedScenarios(prev => 
      prev.includes(id) 
        ? prev.filter(s => s !== id)
        : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col">
      <Header 
        title="Scenarios" 
        description="Browse and run your test scenarios"
        action={
          <div className="flex gap-2">
            {selectedScenarios.length > 0 && (
              <Button>
                <PlayCircle className="mr-2 h-4 w-4" />
                Run {selectedScenarios.length} Selected
              </Button>
            )}
            <Link href="/scenarios/new">
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                New Scenario
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex-1 space-y-6 p-6">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All Scenarios</TabsTrigger>
            <TabsTrigger value="passing">Passing</TabsTrigger>
            <TabsTrigger value="failing">Failing</TabsTrigger>
          </TabsList>
          
          <TabsContent value="all" className="mt-6">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Scenario</TableHead>
                      <TableHead>Last Run</TableHead>
                      <TableHead>Pass Rate</TableHead>
                      <TableHead>Avg Duration</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scenarios.map((scenario) => (
                      <TableRow 
                        key={scenario.id}
                        className="cursor-pointer"
                        onClick={() => toggleScenario(scenario.id)}
                      >
                        <TableCell>
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={selectedScenarios.includes(scenario.id)}
                              onChange={() => {}}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                              <FileCode className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                              <Link 
                                href={`/scenarios/${scenario.id}`}
                                className="font-medium hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {scenario.name}
                              </Link>
                              <p className="text-sm text-muted-foreground">
                                {scenario.steps} steps
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {scenario.lastStatus === 'passed' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span className="text-sm text-muted-foreground">
                              {scenario.lastRun}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={parseFloat(scenario.passRate) >= 90 ? 'default' : 'secondary'}>
                            {scenario.passRate}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{scenario.avgDuration}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={(e) => e.stopPropagation()}>
                              <PlayCircle className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button size="sm" variant="ghost">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>Edit</DropdownMenuItem>
                                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                                <DropdownMenuItem>View History</DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="passing" className="mt-6">
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Passing scenarios will appear here
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="failing" className="mt-6">
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Failing scenarios will appear here
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
