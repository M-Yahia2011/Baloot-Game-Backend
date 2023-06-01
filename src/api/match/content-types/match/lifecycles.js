const { ApplicationError } = require("@strapi/utils").errors;

function orderTeams(team1, team2) {
    if (team1.totalScore === team2.totalScore) {
        return team2.abnat - team1.abnat;
    } else {
        return team2.totalScore - team1.totalScore;
    }
}

async function generateLeagueTable(matchId) {
    let leagues = await strapi.db.connection.raw(`
    select league_id
    from matches_tournament_links mtl 
    inner join public.tournaments_league_links tll on tll.tournament_id = mtl.tournament_id
    where mtl.match_id = ${matchId}; 
    `)

    if (leagues.rows.length === 0) {
        // match not belong to a league
        return;
    }
    let leagueId = leagues.rows[0].league_id;

    let leagueTableData = await strapi.db.connection.raw(`
        select league_tables.id 
        from league_tables
        inner join league_tables_league_links ltll on ltll.league_table_id = league_tables.id
        where ltll.league_id = ${leagueId} 
    `)

    if (leagueTableData.rows.length === 0) {
        // league not a table 
        return;
    }
    let leagueTableID = leagueTableData.rows[0].id;


    let teamsData = await strapi.db.connection.raw(`
    select t.id ,  t.name
    from leagues l 
    inner join tournaments_league_links ttl on ttl.league_id = l.id
    inner join tournaments tourn on ttl.tournament_id = tourn.id
    inner join matches_tournament_links mtl on mtl.tournament_id = tourn.id
    inner join matches m on  m.id = mtl.match_id
    inner join matches_team_1_links mt1l on m.id = mt1l.match_id
    inner join teams t on t.id = mt1l.team_id
    where l.id = ${leagueId} 
    union 
    select t.id ,  t.name
    from leagues l 
    inner join tournaments_league_links ttl on ttl.league_id = l.id
    inner join tournaments tourn on ttl.tournament_id = tourn.id
    inner join matches_tournament_links mtl on mtl.tournament_id = tourn.id
    inner join matches m on  m.id = mtl.match_id
    inner join matches_team_2_links mt2l on m.id = mt2l.match_id
    inner join teams t on t.id = mt2l.team_id
    where l.id = ${leagueId} ;
`)

    let tableObj = {};
    teamsData.rows.forEach((team) => {
        tableObj[team.id] = {
            id: team.id,
            name: team.name,
            abnat: 0,
            play: 0,
            lost: 0,
            win: 0,
            totalScore: 0,
            totalScoreForAbnat: 0,
            totalNumberOfRounds: 0
        };
    });

    let matchesData = await strapi.db.connection.raw(`
    select t1.id as team_1_id,t1.name as team_1_name,m.team_1_score,m.team_1_abnat ,t2.id as team_2_id,t2.name as team_2_name,m.team_2_score,m.team_2_abnat ,m.number_of_rounds
    from leagues l 
    inner join tournaments_league_links ttl on ttl.league_id = l.id
    inner join tournaments t on ttl.tournament_id = t.id
    inner join matches_tournament_links mtl on mtl.tournament_id = t.id
    inner join matches m on m.id = mtl.match_id
    inner join matches_team_1_links mt1l on m.id = mt1l.match_id
    inner join matches_team_2_links mt2l on m.id = mt2l.match_id
    inner join teams t1 on t1.id = mt1l.team_id
    inner join teams t2 on t2.id = mt2l.team_id
    where l.id = 1 and m.state= 'انتهت';
`)

    let matches = matchesData.rows;

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        for (let teamIdx = 1; teamIdx <= 2; teamIdx++) {
            let teamId = match[`team_${teamIdx}_id`]
            tableObj[teamId].totalScoreForAbnat += match[`team_${teamIdx}_abnat`];
            tableObj[teamId].totalNumberOfRounds += match.number_of_rounds;
            tableObj[teamId].play++;
        }
        if (match.team_1_score > match.team_2_score) {
            tableObj[match.team_1_id].win++;
            tableObj[match.team_1_id].totalScore = tableObj[match.team_1_id].win * 3;
            tableObj[match.team_2_id].lost++;

        } else {
            tableObj[match.team_2_id].win++;
            tableObj[match.team_2_id].totalScore = tableObj[match.team_2_id].win * 3;
            tableObj[match.team_1_id].lost++;
        }
    }

    for (const team_id in tableObj) {
        tableObj[team_id].abnat = (tableObj[team_id].totalScoreForAbnat / tableObj[team_id].totalNumberOfRounds).toFixed(1);
    }

    let tableArray = [];
    for (const team_id in tableObj) {
        tableArray.push(tableObj[team_id]);
    }

    tableArray = tableArray.sort(orderTeams)

    await strapi.db.connection.raw(`
        UPDATE 
        league_tables
        SET data = '${JSON.stringify(tableArray)}'
        WHERE league_tables.id = ${leagueTableID};
    `)

}

module.exports = {

    beforeCreate(event) {

        let data = event.params.data;

        if (data.team_1.connect.length == 0 || data.team_2.connect.length == 0) {

            throw new ApplicationError("You Must Enter Two Teams")
        }
        if (data.team_1.connect[0].id == data.team_2.connect[0].id) {

            throw new ApplicationError("The Two Teams Must Be Different")
        }
    },

    async beforeUpdate(event) {
        let params = event.params;
        let matchId = params.where.id;

        let match = await strapi.entityService.findOne("api::match.match", matchId, {
            populate: {
                team_1: {
                    fields: ["id"],
                },
                team_2: {
                    fields: ["id"],
                },
            },
        })
        // the user erased the team 1
        if (params.data.team_1.disconnect.length !== 0 && params.data.team_1.connect.length == 0) {
            throw new ApplicationError("you must choose team 1")
        }
        // the user erased the team 2
        if (params.data.team_2.disconnect.length !== 0 && params.data.team_2.connect.length == 0) {
            throw new ApplicationError("you must choose team 1")
        }

        // the user updated team 1 with same value as team 2
        if (params.data.team_1.connect.length !== 0) {

            if (params.data.team_1.connect[0].id == match.team_2.id) {

                throw new ApplicationError("Team 1 cann't be the same as team 2")
            }
        }
        // the user updated team 2 with same value as team 1
        if (params.data.team_2.connect.length !== 0) {
            if (params.data.team_2.connect[0].id == match.team_1.id) {

                throw new ApplicationError("Team 2 cann't be the same as team 1")

            }
        }

    }
    ,
    async afterCreate(event) {
        let matchId = event.result.id
        console.log(matchId);
        await generateLeagueTable(matchId)
    },

    async afterUpdate(event) {
        let matchId = event.params.where.id;
        await generateLeagueTable(matchId)
    },

    async afterDelete(event) {
        let matchId = event.params.where.id;
        await generateLeagueTable(matchId)
    },


}