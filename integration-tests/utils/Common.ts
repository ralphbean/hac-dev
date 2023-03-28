import { NavItem } from '../support/constants/PageTitle';
import { consentButton, navigation, waits } from '../support/pageObjects/global-po';

export class Common {
  static openAppStudioBaseURL() {
    cy.visit(Cypress.env('HAC_BASE_URL'));
  }

  static navigateTo(link: NavItem) {
    cy.get(navigation.sideNavigation(link), { timeout: 80000 }).click();
    Common.waitForLoad();
  }

  static openURL(URL: string) {
    cy.url().then(($url) => {
      if ($url !== URL) {
        cy.visit(URL);
      }
    });
  }

  static generateAppName(prefix = 'test-app') {
    const name = `${prefix}-${new Date().getTime()}`;
    return name.substring(0, name.length - 4);
  }

  static openApplicationURL(applicationName: string) {
    const workspacePathMatcher = new RegExp(/workspaces\/([^/]+)/);
    cy.url().then((url) => {
      const [, workspace = ''] = url.match(workspacePathMatcher) || [];

      Common.openURL(
        `${Cypress.env(
          'HAC_BASE_URL',
        )}/workspaces/${workspace}/applications/${applicationName.replace('.', '-')}`,
      );
      Common.verifyPageTitle(applicationName);
      Common.waitForLoad();
    });
  }

  static waitForLoad(timeout = 120000) {
    for (const item of Object.values(waits)) {
      cy.get(item, { timeout }).should('not.exist');
    }
  }

  static verifyPageTitle(title: string) {
    cy.contains('h1', title, { timeout: 180000 }).should('be.visible');
  }

  static clickOnConsentButton() {
    cy.get('body')
      .find(consentButton)
      .its('length')
      .then((res) => {
        if (res > 0) {
          cy.get(consentButton).click();
        }
      });
  }

  static cleanNamespace() {
    if (Cypress.env('CLEAN_NAMESPACE') === 'true') {
      cy.exec('export KUBECONFIG=~/.kube/appstudio-config && ./delete-script.sh', {
        timeout: 600000,
      })
        .its('stdout')
        .should('contain', 'Done running the script');
    }
  }

  static getOrigin() {
    return new URL(Cypress.env('HAC_BASE_URL')).origin;
  }

  static checkRowValues(locator: string, valuesToAssert: string[]) {
    for (const value of valuesToAssert) {
      cy.contains(`[data-id="${locator}"]`, value, { timeout: 20000 }).should('exist');
    }
  }

  static githubRequest(method: Cypress.HttpMethod, url: string, body?: Cypress.RequestBody) {
    const options = {
      method: method,
      url: url,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${Cypress.env('GH_TOKEN')}`,
        'X-GitHub-Api-Version': '2022-11-28',
      }
    }
    if (body) {
      options['body'] = body
    }
    return cy.request(options)
  }

  static checkResponseBodyAndStatusCode(url: string, responseBodyContent: string, waitInterval: number = 2000, retryNum: number = 0, maxRetryNum: number = 10, headers?: object) {
    expect(retryNum).to.be.lessThan(maxRetryNum);
    const options = {
      url,
      timeout: 30000,
      failOnStatusCode: false,
    }
    if (headers) {
      options['headers'] = headers
    }
    cy.request(options).then((resp) => {
      if (resp.status === 200 && JSON.stringify(resp.body).includes(responseBodyContent) === true) {
        cy.log(
          `The response body of URL: ${url}, now contains the content: ${responseBodyContent}`,
        );
        return;
      }

      cy.log('The response body of URL doesnt contain the expected content yet, retrying...');
      cy.wait(waitInterval);
      Common.checkResponseBodyAndStatusCode(url, responseBodyContent, waitInterval, retryNum + 1, maxRetryNum, headers);
    });
  }

  static createGitHubRepository(repoName: string) {
    const body = { name: repoName }
    Common.githubRequest('POST', 'https://api.github.com/orgs/redhat-hac-qe/repos', body)
  }

  static deleteGitHubRepository(owner: string, repoName: string) {
    Common.githubRequest('DELETE', `https://api.github.com/repos/redhat-hac-qe/${repoName}`)
  }

  static importCodeToGitHubRepository(fromRepoLink: string, toRepoName: string) {
    const body = {
      vcs: 'git',
      vcs_url: fromRepoLink,
    }
    Common.githubRequest('PUT', `https://api.github.com/repos/redhat-hac-qe/${toRepoName}/import`, body)
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${Cypress.env('GH_TOKEN')}`,
      'X-GitHub-Api-Version': '2022-11-28',
    }
    Common.checkResponseBodyAndStatusCode(`https://api.github.com/repos/redhat-hac-qe/${toRepoName}/import`, '"status":"complete"', 5000, 0, 20, headers);
  }

  //NOTE : This is currently not being used. keeping it for incase future for use case.
  static getPRNumber(componentName: string, publicGitRepo: string) {
    const owner = publicGitRepo.split('/')[3];
    const repoName = publicGitRepo.split('/')[4];

    return Common.githubRequest('GET', `https://api.github.com/search/issues?q=${componentName}+type:pr+repo:${owner}/${repoName}`)
      .then((searchIssueResponse) => {
        const pullNumber = searchIssueResponse.body.items[0].number;
        cy.log(pullNumber);
        cy.wrap(String(pullNumber)).as('pullNumber');
      });
  }

  //NOTE : This is currently not being used. keeping it for incase future for use case.
  static deleteFolder(publicGitRepo: string, folderToDelete: string) {
    const GITHUB_TOKEN: string = Cypress.env('GH_TOKEN');
    const REPOSITORY_OWNER = publicGitRepo.split('/')[3];
    const REPOSITORY_NAME = publicGitRepo.split('/')[4];
    const TYPE = { BLOB: 'blob', TREE: 'tree' };
    const BRANCH_NAME = 'main';
    const COMMITS_URL = `https://api.github.com/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/commits`;
    const REPOSITORY_TREES_URL = `https://api.github.com/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/trees`;
    const REF_URL = `https://api.github.com/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/refs/heads/${BRANCH_NAME}`;
    const headers = {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
    };

    // Get the sha of the last commit on BRANCH_NAME
    cy.request({
      url: REF_URL,
      headers,
    }).then((resp) => {
      const currentCommitSha = resp.body.object.sha;

      // Get the sha of the root tree on the commit retrieved previously
      const COMMIT_URL = `${COMMITS_URL}/${currentCommitSha}`;

      cy.request({
        url: COMMIT_URL,
        headers,
      }).then((resp) => {
        const treeSha = resp.body.tree.sha;

        // Get the tree corresponding to the folder that must be deleted.
        // Uses the recursive query parameter to retrieve all files whatever the depth.
        // The result might come back truncated if the number of hits is big.
        // This truncated output case is NOT handled.
        cy.request({
          url: `${REPOSITORY_TREES_URL}/${BRANCH_NAME}:${folderToDelete}`,
          headers,
          body: {
            recursive: true,
          },
        }).then((resp) => {
          const oldTree = resp.body.tree;

          // Create a tree to edit the content of the repository, basically select all files
          // in the previous tree and mark them with sha=null to delete them.
          // The folder only exists in git if it has a file in its offspring.
          const newTree = oldTree
            .filter(({ type }) => type === TYPE.BLOB)
            .map(({ path, mode, type }) => ({
              path: `${folderToDelete}/${path}`,
              sha: null,
              mode,
              type,
            })); // If sha is null => the file gets deleted

          // Create a new tree with the file offspring of the target folder removed
          cy.request({
            method: 'POST',
            url: REPOSITORY_TREES_URL,
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              'X-GitHub-Api-Version': '2022-11-28',
            },
            body: {
              base_tree: treeSha,
              tree: newTree,
            },
          }).then((resp) => {
            const newTreeSha = resp.body.sha;

            // Create a commit that uses the tree created above
            cy.request({
              url: COMMITS_URL,
              method: 'POST',
              headers,
              body: {
                message: "Committing with GitHub's API :fire:",
                tree: newTreeSha,
                parents: [currentCommitSha],
              },
            }).then((resp) => {
              const newCommitSha = resp.body.sha;

              // Make BRANCH_NAME point to the created commit
              cy.request({
                url: REF_URL,
                method: 'POST',
                headers,
                body: {
                  sha: newCommitSha,
                },
              });
            });
          });
        });
      });
    });
  }
}
