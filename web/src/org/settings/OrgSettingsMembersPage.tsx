import ErrorIcon from '@sourcegraph/icons/lib/Error'
import upperFirst from 'lodash/upperFirst'
import * as React from 'react'
import { RouteComponentProps } from 'react-router'
import { Observable } from 'rxjs/Observable'
import { merge } from 'rxjs/observable/merge'
import { of } from 'rxjs/observable/of'
import { catchError } from 'rxjs/operators/catchError'
import { distinctUntilChanged } from 'rxjs/operators/distinctUntilChanged'
import { filter } from 'rxjs/operators/filter'
import { map } from 'rxjs/operators/map'
import { publishReplay } from 'rxjs/operators/publishReplay'
import { refCount } from 'rxjs/operators/refCount'
import { switchMap } from 'rxjs/operators/switchMap'
import { tap } from 'rxjs/operators/tap'
import { Subject } from 'rxjs/Subject'
import { Subscription } from 'rxjs/Subscription'
import { gql, queryGraphQL } from '../../backend/graphql'
import { FilteredConnection } from '../../components/FilteredConnection'
import { HeroPage } from '../../components/HeroPage'
import { PageTitle } from '../../components/PageTitle'
import { eventLogger } from '../../tracking/eventLogger'
import { createAggregateError, ErrorLike, isErrorLike } from '../../util/errors'
import { removeUserFromOrg } from '../backend'
import { InviteForm } from '../invite/InviteForm'

interface UserNodeProps {
    /** The user to display in this list item. */
    node: GQL.IUser

    /** The organization being displayed. */
    org: GQL.IOrg

    /** The currently authenticated user. */
    authenticatedUser: GQL.IUser | null

    /** Called when the user is updated by an action in this list item. */
    onDidUpdate?: () => void
}

interface UserNodeState {
    /** Undefined means in progress, null means done or not started. */
    removalOrError?: null | ErrorLike
}

class UserNode extends React.PureComponent<UserNodeProps, UserNodeState> {
    public state: UserNodeState = {
        removalOrError: null,
    }

    private removes = new Subject<void>()
    private subscriptions = new Subscription()

    private get isSelf(): boolean {
        return this.props.authenticatedUser !== null && this.props.node.id === this.props.authenticatedUser.id
    }

    public componentDidMount(): void {
        this.subscriptions.add(
            this.removes
                .pipe(
                    filter(() =>
                        window.confirm(
                            this.isSelf
                                ? 'Really leave the organization?'
                                : `Really remove the user ${this.props.node.username}?`
                        )
                    ),
                    switchMap(() => {
                        type PartialStateUpdate = Pick<UserNodeState, 'removalOrError'>
                        const result = removeUserFromOrg(this.props.org.id, this.props.node.id).pipe(
                            catchError(error => [error]),
                            map(c => ({ removalOrError: c })),
                            tap(() => {
                                if (this.props.onDidUpdate) {
                                    this.props.onDidUpdate()
                                }
                            }),
                            publishReplay<PartialStateUpdate>(),
                            refCount()
                        )
                        return merge(of({ removalOrError: null }), result)
                    })
                )
                .subscribe(
                    stateUpdate => {
                        this.setState(stateUpdate)
                    },
                    error => console.error(error)
                )
        )
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    public render(): JSX.Element | null {
        const loading = this.state.removalOrError === undefined
        return (
            <li className="site-admin-detail-list__item site-admin-all-users-page__item-container">
                <div className="site-admin-all-users-page__item">
                    <div className="site-admin-detail-list__header">
                        <span className="site-admin-detail-list__name">{this.props.node.username}</span>
                        {this.props.node.displayName && (
                            <>
                                <br />
                                <span className="site-admin-detail-list__display-name">
                                    {this.props.node.displayName}
                                </span>
                            </>
                        )}
                    </div>
                    <div className="site-admin-detail-list__actions">
                        {this.props.authenticatedUser &&
                            this.props.org.viewerCanAdminister && (
                                <button
                                    className="btn btn-secondary btn-sm site-admin-detail-list__action"
                                    onClick={this.remove}
                                    disabled={loading}
                                >
                                    {this.isSelf ? 'Leave organization' : 'Remove from organization'}
                                </button>
                            )}
                        {isErrorLike(this.state.removalOrError) && (
                            <p className="site-admin-detail-list__error">
                                {upperFirst(this.state.removalOrError.message)}
                            </p>
                        )}
                    </div>
                </div>
            </li>
        )
    }

    private remove = () => this.removes.next()
}

interface Props extends RouteComponentProps<{}> {
    org: GQL.IOrg
    user?: GQL.IUser
}

interface State {
    /**
     * Whether the viewer can administer this org. This is updated whenever a member is added or removed, so that
     * we can detect if the currently authenticated user is no longer able to administer the org (e.g., because
     * they removed themselves and they are not a site admin).
     */
    viewerCanAdminister: boolean
}

class FilteredUserConnection extends FilteredConnection<
    GQL.IUser,
    Pick<UserNodeProps, 'org' | 'authenticatedUser' | 'onDidUpdate'>
> {}

/**
 * The organizations members page
 */
export class OrgSettingsMembersPage extends React.PureComponent<Props, State> {
    private orgChanges = new Subject<GQL.IOrg>()
    private userUpdates = new Subject<void>()
    private subscriptions = new Subscription()

    constructor(props: Props) {
        super(props)
        this.state = { viewerCanAdminister: props.org.viewerCanAdminister }
    }

    public componentDidMount(): void {
        this.subscriptions.add(
            this.orgChanges
                .pipe(
                    distinctUntilChanged((a, b) => a.id === b.id),
                    tap(org => eventLogger.logViewEvent('OrgMembers', { organization: { org_name: org.name } }))
                )
                .subscribe(org => {
                    this.setState({ viewerCanAdminister: org.viewerCanAdminister })
                    this.userUpdates.next()
                })
        )
    }

    public componentWillReceiveProps(props: Props): void {
        if (props.org !== this.props.org) {
            this.orgChanges.next(props.org)
        }
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    public render(): JSX.Element | null {
        if (!this.props.user) {
            return (
                <HeroPage icon={ErrorIcon} title="Error" subtitle="Must be logged in to view organization members." />
            )
        }

        const nodeProps: Pick<UserNodeProps, 'org' | 'authenticatedUser' | 'onDidUpdate'> = {
            org: { ...this.props.org, viewerCanAdminister: this.state.viewerCanAdminister },
            authenticatedUser: this.props.user,
            onDidUpdate: this.onDidUpdateUser,
        }

        return (
            <div className="org-settings-members-page">
                <PageTitle title={`Members - ${this.props.org.name}`} />
                <InviteForm orgID={this.props.org.id} />
                <FilteredUserConnection
                    className="site-admin-page__filtered-connection"
                    noun="member"
                    pluralNoun="members"
                    queryConnection={this.fetchOrgMembers}
                    nodeComponent={UserNode}
                    nodeComponentProps={nodeProps}
                    noShowMore={true}
                    hideFilter={true}
                    updates={this.userUpdates}
                    history={this.props.history}
                    location={this.props.location}
                />
            </div>
        )
    }

    private onDidUpdateUser = () => this.userUpdates.next()

    private fetchOrgMembers = (): Observable<GQL.IUserConnection> =>
        queryGraphQL(
            gql`
                query OrganizationMembers($id: ID!) {
                    node(id: $id) {
                        ... on Org {
                            viewerCanAdminister
                            members {
                                nodes {
                                    id
                                    username
                                    displayName
                                    avatarURL
                                }
                                totalCount
                            }
                        }
                    }
                }
            `,
            { id: this.props.org.id }
        ).pipe(
            map(({ data, errors }) => {
                if (!data || !data.node) {
                    throw createAggregateError(errors)
                }
                const org = data.node as GQL.IOrg
                if (!org.members) {
                    throw createAggregateError(errors)
                }
                this.setState({ viewerCanAdminister: org.viewerCanAdminister })
                return org.members
            })
        )
}
