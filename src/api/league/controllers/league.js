"use strict";
const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::league.league", ({ strapi }) => {
  return {
    async summary(ctx) {
      let league = await this.findLeague(ctx)
      let data = await strapi.db.connection.raw(`
        select data 
        from league_tables_league_links ltll 
        inner join league_tables lt on lt.id = ltll.league_table_id
        where ltll.league_id = ${league.id};
      `)
      if (data.rows.length === 0) {
        ctx.throw(404, "League or Table Not Found");
      } else {
        let res = { ...league, table: JSON.parse(data.rows[0].data) }
        return res
      }

    },
    async findAllStudiosOfLeague(ctx) {
      let league = await this.findLeague(ctx)
      let studiosAnalysts = await strapi.db.connection.raw(
        `
        select s.id as studio_id , a.name as analyst_name , a.id as analyst_id ,s.name as studio_name , s.start_at , s.url ,t.name as tournament_name
        from leagues l 
        inner join tournaments_league_links ttl on ttl.league_id = l.id
        inner join tournaments t on ttl.tournament_id = t.id
        inner join tournaments_studio_links tsl on tsl.tournament_id = t.id
        inner join studios s on  s.id = tsl.studio_id
        inner join analysts_studio_links asl on asl.studio_id = s.id
        inner join analysts a on a.id = asl.analyst_id
        where l.id = ${league.id}
        order by s.start_at;
      `)
      let studiosObj = {}
      studiosAnalysts.rows.forEach((analyst) => {
        if (!Object.hasOwnProperty.call(studiosObj, analyst.studio_id)) {
          studiosObj[analyst.studio_id] = {
            name: analyst.studio_name,
            id: analyst.studio_id,
            url: analyst.url,
            start_at: analyst.start_at,
            tournament_name: analyst.tournament_name,
            analysts: []
          }
        }
        studiosObj[analyst.studio_id].analysts.push({
          id: analyst.studio_id,
          name: analyst.analyst_name,
        })
      })
      let studios = []
      for (const key in studiosObj) {
        studios.push(studiosObj[key])
      }
      let res = { ...league, studios: studios }
      return res
    },
    async findAllRefereesOfLeague(ctx) {
      let league = await this.findLeague(ctx)
      let referees = await strapi.db.connection.raw(`
        select distinct(r.id) , r.name  ,fr.formats -> 'thumbnail' ->> 'url' as image
        from leagues l 
        inner join tournaments_league_links ttl on ttl.league_id = l.id
        inner join tournaments t on ttl.tournament_id = t.id
        inner join matches_tournament_links mtl on mtl.tournament_id = t.id
        inner join matches_referees_links mrl on mrl.match_id = mtl.match_id
        inner join referees r on r.id = mrl.referee_id
        inner join files_related_morphs frmr on frmr.related_id = r.id
        inner join files fr on frmr.file_id = fr.id
        where l.id = ${league.id} and frmr.related_type = 'api::referee.referee' 
      `)
      return { ...league, referees: referees.rows }
    },
    async findAllTeamsOfLeague(ctx) {
      let leaguePlayers = await this.findAllPlayersOfLeague(ctx);
      let teams = {}
      leaguePlayers.players.forEach((player) => {
        if (!Object.hasOwnProperty.call(teams, player.team_id)) {
          teams[player.team_id] = {
            name: player.team_name,
            id: player.team_id,
            logo: player.team_logo,
            players: []
          }
        }
        if (player.player_order === 1) {
          teams[player.team_id].players.unshift({
            id: player.player_id,
            name: player.name,
            image: player.player_img,
            is_captain: true
          })
        } else {
          teams[player.team_id].players.push({
            id: player.player_id,
            name: player.name,
            image: player.player_img,
            is_captain: false
          })
        }

      })
      let res = { ...leaguePlayers, teams: teams }
      delete res.players;
      return res
    },
    async findAllPlayersOfLeague(ctx) {
      let league = await this.findLeague(ctx)
      let players = await strapi.db.connection.raw(
        `
          select distinct(p.id) as player_id ,p.name,ptl.player_order , fp.formats -> 'thumbnail' ->> 'url' as player_img ,  
              t.id as team_id, t.name as team_name, ft.formats -> 'thumbnail' ->> 'url' as team_logo
          from leagues l 
          inner join tournaments_league_links ttl on ttl.league_id = l.id
          inner join tournaments tourn on ttl.tournament_id = tourn.id
          inner join matches_tournament_links mtl on mtl.tournament_id = tourn.id
          inner join matches m on  m.id = mtl.match_id
          inner join matches_team_1_links mt1l on m.id = mt1l.match_id
          inner join teams t on t.id = mt1l.team_id
          inner join players_team_links ptl on ptl.team_id = t.id
          inner join players p on p.id = ptl.player_id
          inner join files_related_morphs frmt on frmt.related_id = t.id
          inner join files ft on frmt.file_id = ft.id
          inner join files_related_morphs frmp on frmp.related_id = p.id
          inner join files fp on frmp.file_id = fp.id
          where l.id = ${league.id} and frmt.related_type = 'api::team.team'  and frmp.related_type = 'api::player.player'

          union 

          select distinct(p.id) as player_id ,p.name,ptl.player_order , fp.formats -> 'thumbnail' ->> 'url' as player_img ,  
              t.id as team_id, t.name as team_name, ft.formats -> 'thumbnail' ->> 'url' as team_logo
          from leagues l 
          inner join tournaments_league_links ttl on ttl.league_id = l.id
          inner join tournaments tourn on ttl.tournament_id = tourn.id
          inner join matches_tournament_links mtl on mtl.tournament_id = tourn.id
          inner join matches m on  m.id = mtl.match_id
          inner join matches_team_2_links mt1l on m.id = mt1l.match_id
          inner join teams t on t.id = mt1l.team_id
          inner join players_team_links ptl on ptl.team_id = t.id
          inner join players p on p.id = ptl.player_id
          inner join files_related_morphs frmt on frmt.related_id = t.id
          inner join files ft on frmt.file_id = ft.id
          inner join files_related_morphs frmp on frmp.related_id = p.id
          inner join files fp on frmp.file_id = fp.id
          where l.id = ${league.id} and frmt.related_type = 'api::team.team'  and frmp.related_type = 'api::player.player';
    `)
      return { ...league, players: players.rows }
    },
    async findAllMatchesOfLeague(ctx) {
      let league = await this.findLeague(ctx)
      let data = await strapi.db.connection.raw(`
          select m.id,t1.name as team_1_name,m.team_1_score, f1.formats -> 'thumbnail' ->> 'url' as team_1_logo,t2.name as team_2_name,m.team_2_score,f2.formats -> 'thumbnail' ->> 'url' as team_2_logo, m.state ,m.url, m.start_at,t.name as tournament_name
          from leagues l 
          inner join tournaments_league_links ttl on ttl.league_id = l.id
          inner join tournaments t on ttl.tournament_id = t.id
          inner join matches_tournament_links mtl on mtl.tournament_id = t.id
          inner join matches m on m.id = mtl.match_id
          inner join matches_team_1_links mt1l on m.id = mt1l.match_id
          inner join matches_team_2_links mt2l on m.id = mt2l.match_id
          inner join teams t1 on t1.id = mt1l.team_id
          inner join teams t2 on t2.id = mt2l.team_id
          inner join files_related_morphs frm1 on frm1.related_id = t1.id
          inner join files_related_morphs frm2 on frm2.related_id = t2.id
          inner join files f1 on frm1.file_id = f1.id
          inner join files f2 on frm2.file_id = f2.id
          where l.id = ${league.id} and frm1.related_type = 'api::team.team' and frm2.related_type = 'api::team.team'
          order by m.start_at;      
      `)
      return { ...league, matches: data.rows };
    },
    async findLeague(ctx) {
      let leagueId = strapi.requestContext.get().params.id;
      if (!leagueId || isNaN(leagueId)) {
        console.log("from in valid ID ");
        ctx.throw(404, "League Not Found");
      }

      let leagueDate = await strapi.db.connection.raw(`
        select l.id , l.name , f.formats -> 'thumbnail' ->> 'url' as logo
        from leagues l
        inner join files_related_morphs frm on frm.related_id = l.id
        inner join files f on frm.file_id = f.id
        where l.id = ${leagueId} and frm.related_type = 'api::league.league';
        `)

      if (leagueDate.rows.length === 0) {
        console.log("from in valid ID from sql query");
        ctx.throw(404, "League Not Found");
      }
      return { ...leagueDate.rows[0] }
    },
  };
});
