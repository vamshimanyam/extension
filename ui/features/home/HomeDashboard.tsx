import { BarChart3, Database, HardDrive, RefreshCw } from 'lucide-react'
import { Badge, Button, Card, Flex, Grid, Heading, Separator, Text } from '@radix-ui/themes'
import * as React from 'react'
import { sendMessage } from '../../../messaging/client'
import useDashboardStore from '../../store/useDashboardStore'

function formatBytes(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = sizeBytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`
}

function HomeDashboard() {
  const dashboard = useDashboardStore((state) => state.dashboard)
  const loading = useDashboardStore((state) => state.loading)
  const error = useDashboardStore((state) => state.error)
  const setLoading = useDashboardStore((state) => state.setLoading)
  const setDashboard = useDashboardStore((state) => state.setDashboard)
  const setError = useDashboardStore((state) => state.setError)

  const loadDashboard = React.useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await sendMessage('GET_DASHBOARD', undefined)
      setDashboard(response.dashboard)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [setDashboard, setError, setLoading])

  React.useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  return (
    <section>
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center" gap="2" wrap="wrap">
          <Heading size="5" as="h1">
            IndexedDB Dashboard
          </Heading>
          <Button variant="soft" onClick={() => void loadDashboard()} loading={loading}>
            <RefreshCw size={14} />
            Refresh
          </Button>
        </Flex>

        {error && (
          <Card>
            <Text size="2" color="red">
              {error}
            </Text>
          </Card>
        )}

        {!dashboard && !loading && !error && (
          <Card>
            <Text size="2" color="gray">
              No dashboard data available.
            </Text>
          </Card>
        )}

        {dashboard && (
          <>
            <Grid columns={{ initial: '1', sm: '2' }} gap="3">
              <Card className="dashboard-metric-card">
                <Flex direction="column" gap="1">
                  <Flex align="center" gap="2">
                    <Database size={16} />
                    <Text size="2" color="gray">
                      Database
                    </Text>
                  </Flex>
                  <Text size="5" weight="bold">
                    {dashboard.dbName}
                  </Text>
                  <Text size="1" color="gray">
                    Version {dashboard.dbVersion}
                  </Text>
                </Flex>
              </Card>

              <Card className="dashboard-metric-card">
                <Flex direction="column" gap="1">
                  <Flex align="center" gap="2">
                    <HardDrive size={16} />
                    <Text size="2" color="gray">
                      Estimated Data Size
                    </Text>
                  </Flex>
                  <Text size="5" weight="bold">
                    {formatBytes(dashboard.totalEstimatedBytes)}
                  </Text>
                  <Text size="1" color="gray">
                    Screenshots: {formatBytes(dashboard.screenshotsBytes)}
                  </Text>
                </Flex>
              </Card>

              <Card className="dashboard-metric-card">
                <Flex direction="column" gap="1">
                  <Flex align="center" gap="2">
                    <BarChart3 size={16} />
                    <Text size="2" color="gray">
                      Sessions
                    </Text>
                  </Flex>
                  <Text size="5" weight="bold">
                    {dashboard.sessionsTotal}
                  </Text>
                  <Flex gap="2" wrap="wrap">
                    <Badge color="green" variant="soft">
                      Active: {dashboard.sessionsActive}
                    </Badge>
                    <Badge color="blue" variant="soft">
                      Completed: {dashboard.sessionsCompleted}
                    </Badge>
                    <Badge color="gray" variant="soft">
                      Archived: {dashboard.sessionsArchived}
                    </Badge>
                  </Flex>
                </Flex>
              </Card>

              <Card className="dashboard-metric-card">
                <Flex direction="column" gap="1">
                  <Flex align="center" gap="2">
                    <BarChart3 size={16} />
                    <Text size="2" color="gray">
                      Capture Volume
                    </Text>
                  </Flex>
                  <Text size="5" weight="bold">
                    {dashboard.stepsTotal} steps
                  </Text>
                  <Text size="1" color="gray">
                    Screenshots: {dashboard.screenshotsTotal}
                  </Text>
                </Flex>
              </Card>
            </Grid>

            <Card>
              <Flex direction="column" gap="3">
                <Heading size="3" as="h2">
                  Store Breakdown
                </Heading>
                {dashboard.storeStats.map((store) => (
                  <Flex key={store.storeName} direction="column" gap="1" className="dashboard-store-row">
                    <Flex justify="between" align="center">
                      <Text size="2" weight="medium">
                        {store.storeName}
                      </Text>
                      <Flex gap="2" align="center">
                        <Badge color="gray" variant="soft">
                          {store.count} records
                        </Badge>
                        <Text size="1" color="gray">
                          {formatBytes(store.sizeBytes)}
                        </Text>
                      </Flex>
                    </Flex>
                  </Flex>
                ))}

                {dashboard.storageEstimate && (
                  <>
                    <Separator size="4" />
                    <Flex direction="column" gap="1">
                      <Text size="2" weight="medium">
                        Origin Storage Estimate
                      </Text>
                      <Text size="2" color="gray">
                        {formatBytes(dashboard.storageEstimate.usageBytes)} used of{' '}
                        {formatBytes(dashboard.storageEstimate.quotaBytes)} ({dashboard.storageEstimate.percentUsed}% used)
                      </Text>
                    </Flex>
                  </>
                )}
              </Flex>
            </Card>

            <Card>
              <Flex direction="column" gap="2">
                <Heading size="3" as="h2">
                  Recent Sessions
                </Heading>

                {dashboard.recentSessions.length === 0 && (
                  <Text size="2" color="gray">
                    No sessions found in IndexedDB.
                  </Text>
                )}

                {dashboard.recentSessions.map((session) => (
                  <Flex key={session.id} justify="between" align="center" className="dashboard-session-row">
                    <Flex direction="column" gap="1">
                      <Text size="2" weight="medium">
                        {session.name}
                      </Text>
                      <Text size="1" color="gray">
                        Updated {new Date(session.updatedAt).toLocaleString()}
                      </Text>
                    </Flex>
                    <Flex gap="2" align="center">
                      <Badge color="gray" variant="soft">
                        {session.stepCount} steps
                      </Badge>
                      <Badge color={session.status === 'active' ? 'green' : 'blue'} variant="soft">
                        {session.status}
                      </Badge>
                    </Flex>
                  </Flex>
                ))}
              </Flex>
            </Card>
          </>
        )}
      </Flex>
    </section>
  )
}

export default HomeDashboard
