import React, { useContext, useState } from 'react'

import classNames from 'classnames'
import { useHistory } from 'react-router'

import { useQuery } from '@sourcegraph/http-client'
import { TelemetryProps } from '@sourcegraph/shared/src/telemetry/telemetryService'
import { Card, CardBody, useDebounce, useDeepMemo } from '@sourcegraph/wildcard'

import {
    GetInsightViewResult,
    GetInsightViewVariables,
    InsightViewFiltersInput,
    SeriesDisplayOptionsInput,
} from '../../../../../../../graphql-operations'
import { useSeriesToggle } from '../../../../../../../insights/utils/use-series-toggle'
import { InsightCard, InsightCardHeader, InsightCardLoading, FormChangeEvent } from '../../../../../components'
import {
    DrillDownInsightFilters,
    FilterSectionVisualMode,
    DrillDownInsightCreationForm,
    DrillDownFiltersStep,
    BackendInsightChart,
    BackendInsightErrorAlert,
    InsightIncompleteAlert,
    DrillDownFiltersFormValues,
    DrillDownInsightCreationFormValues,
} from '../../../../../components/insights-view-grid/components/backend-insight/components'
import {
    BackendInsightData,
    BackendInsight,
    CodeInsightsBackendContext,
    InsightFilters,
    useSaveInsightAsNewView,
    isComputeInsight,
} from '../../../../../core'
import { GET_INSIGHT_VIEW_GQL } from '../../../../../core/backend/gql-backend'
import { createBackendInsightData } from '../../../../../core/backend/gql-backend/methods/get-backend-insight-data/deserializators'
import { insightPollingInterval } from '../../../../../core/backend/gql-backend/utils/insight-polling'
import { getTrackingTypeByInsightType, useCodeInsightViewPings } from '../../../../../pings'
import { StandaloneInsightContextMenu } from '../context-menu/StandaloneInsightContextMenu'

import styles from './StandaloneBackendInsight.module.scss'

interface StandaloneBackendInsight extends TelemetryProps {
    insight: BackendInsight
    className?: string
}

export const StandaloneBackendInsight: React.FunctionComponent<StandaloneBackendInsight> = props => {
    const { telemetryService, insight, className } = props
    const history = useHistory()
    const { updateInsight } = useContext(CodeInsightsBackendContext)
    const [saveAsNewView] = useSaveInsightAsNewView({ dashboard: null })

    const seriesToggleState = useSeriesToggle()
    const [insightData, setInsightData] = useState<BackendInsightData | undefined>()

    // Visual line chart settings
    const [zeroYAxisMin, setZeroYAxisMin] = useState(false)
    const [step, setStep] = useState(DrillDownFiltersStep.Filters)

    // Original insight filters values that are stored in setting subject with insight
    // configuration object, They are updated  whenever the user clicks update/save button
    const [originalInsightFilters, setOriginalInsightFilters] = useState(insight.filters)

    // Live valid filters from filter form. They are updated whenever the user is changing
    // filter value in filters fields.
    const [filters, setFilters] = useState<InsightFilters>(originalInsightFilters)
    const [filterVisualMode, setFilterVisualMode] = useState<FilterSectionVisualMode>(FilterSectionVisualMode.Preview)
    const debouncedFilters = useDebounce(useDeepMemo<InsightFilters>(filters), 500)

    const filterInput: InsightViewFiltersInput = {
        includeRepoRegex: debouncedFilters.includeRepoRegexp,
        excludeRepoRegex: debouncedFilters.excludeRepoRegexp,
        searchContexts: [debouncedFilters.context],
    }

    const seriesDisplayOptions: SeriesDisplayOptionsInput = {
        limit: debouncedFilters.seriesDisplayOptions.limit,
        numSamples: debouncedFilters.seriesDisplayOptions.numSamples,
        sortOptions: debouncedFilters.seriesDisplayOptions.sortOptions,
    }

    const { error, loading, stopPolling } = useQuery<GetInsightViewResult, GetInsightViewVariables>(
        GET_INSIGHT_VIEW_GQL,
        {
            variables: { id: insight.id, filters: filterInput, seriesDisplayOptions },
            fetchPolicy: 'cache-and-network',
            pollInterval: insightPollingInterval(insight),
            context: { concurrentRequests: { key: 'GET_INSIGHT_VIEW' } },
            onCompleted: data => {
                const node = data.insightViews.nodes[0]
                if (node === null) {
                    stopPolling()
                    return
                }
                const parsedData = createBackendInsightData({ ...insight, filters }, node)
                if (!parsedData.isFetchingHistoricalData) {
                    stopPolling()
                }
                setInsightData(parsedData)
            },
            onError: () => {
                stopPolling()
            },
        }
    )

    const { trackMouseLeave, trackMouseEnter, trackDatumClicks } = useCodeInsightViewPings({
        telemetryService,
        insightType: getTrackingTypeByInsightType(insight.type),
    })

    const handleFilterChange = (event: FormChangeEvent<DrillDownFiltersFormValues>): void => {
        if (event.valid) {
            setFilters(event.values)
        }
    }

    const handleFilterSave = async (filters: InsightFilters): Promise<void> => {
        await updateInsight({ insightId: insight.id, nextInsightData: { ...insight, filters } }).toPromise()
        setOriginalInsightFilters(filters)
        telemetryService.log('CodeInsightsSearchBasedFilterUpdating')
    }

    const handleInsightFilterCreation = async (values: DrillDownInsightCreationFormValues): Promise<void> => {
        await saveAsNewView({
            insight,
            filters,
            title: values.insightName,
            dashboard: null,
        })

        setOriginalInsightFilters(filters)
        history.push('/insights/all')
        telemetryService.log('CodeInsightsSearchBasedFilterInsightCreation')
    }

    return (
        <div className={classNames(className, styles.root)}>
            <Card as={CardBody} className={styles.filters}>
                {step === DrillDownFiltersStep.Filters && (
                    <DrillDownInsightFilters
                        initialValues={filters}
                        originalValues={originalInsightFilters}
                        visualMode={filterVisualMode}
                        // It doesn't make sense to have max series per point for compute insights
                        // because there is always only one point per series
                        isNumSamplesFilterAvailable={!isComputeInsight(insight)}
                        onVisualModeChange={setFilterVisualMode}
                        onFiltersChange={handleFilterChange}
                        onFilterSave={handleFilterSave}
                        onCreateInsightRequest={() => setStep(DrillDownFiltersStep.ViewCreation)}
                    />
                )}

                {step === DrillDownFiltersStep.ViewCreation && (
                    <DrillDownInsightCreationForm
                        onCreateInsight={handleInsightFilterCreation}
                        onCancel={() => setStep(DrillDownFiltersStep.Filters)}
                    />
                )}
            </Card>

            <InsightCard
                data-testid={`insight-standalone-card.${insight.id}`}
                className={styles.chart}
                onMouseEnter={trackMouseEnter}
                onMouseLeave={trackMouseLeave}
            >
                <InsightCardHeader title={insight.title}>
                    {insightData?.incompleteAlert && <InsightIncompleteAlert alert={insightData.incompleteAlert} />}
                    <StandaloneInsightContextMenu
                        insight={insight}
                        zeroYAxisMin={zeroYAxisMin}
                        onToggleZeroYAxisMin={setZeroYAxisMin}
                    />
                </InsightCardHeader>

                {error ? (
                    <BackendInsightErrorAlert error={error} />
                ) : loading || !insightData ? (
                    <InsightCardLoading>Loading code insight</InsightCardLoading>
                ) : (
                    <BackendInsightChart
                        {...insightData}
                        locked={insight.isFrozen}
                        zeroYAxisMin={zeroYAxisMin}
                        onDatumClick={trackDatumClicks}
                        seriesToggleState={seriesToggleState}
                    />
                )}
            </InsightCard>
        </div>
    )
}
