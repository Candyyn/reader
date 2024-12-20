const { Agent, AgentCapabilities } = require('../core/agent.js')
const Bottleneck = require('bottleneck')
const { logger } = require('../loaders/logger.js')
const cheerio = require('cheerio')
const utils = require('../utils/agent.utils')

// noinspection JSJQueryEfficiency
class Asurascans extends Agent {
  // #region private
  #limiter = new Bottleneck({
    maxConcurrent: 1, minTime: 1000
  })

  #lookupSchema = {
    id: 'id',
    title: 'name',
    altTitles: 'synonyms',
    desc: '',
    url: 'url',
    year: 'year',
    cover: 'cover',
    genre: '',
    score: '',
    status: 'state',
    lastChapter: '',
    authors: '',
    'externalIds.asurascans': 'id',
    'externalLinks.asurascans': 'uri'
  }

  #mangaSchema = {
    id: 'id',
    type: '',
    canonicalTitle: 'title',
    altTitles: 'altTitle',
    genres: 'genres',
    'description.en_us': 'desc',
    'coverImage.asurascans': 'cover',
    chapterCount: 'chapterCount',
    startYear: 'year',
    status: 'status',
    authors: 'authors',
    'externalIds.asurascans': 'id',
    'externalLinks.asurascans': 'uri'
  }

  #chapterSchema = {
    id: '',
    'titles.en': 'title',
    mangaId: '',
    langAvailable: 'lang',
    posterImage: '',
    volume: 'volume',
    chapter: 'chapter',
    pages: '',
    publishAt: '',
    readableAt: '',
    'externalIds.asurascans': 'id',
    'externalLinks.asurascans': 'uri',
    source: {
      path: '',
      fn: () => {
        return 'asurascans'
      }
    }
  }

  #pageSchema = {
    page: 'page',
    pageURL: 'url',
    chapterId: 'chapterId',
    mangaId: '',
    referer: 'referer'
  }

  async #parseSearch (host, doc) {
    const results = []
    const $ = cheerio.load(doc)

    $('div.grid.grid-cols-2.sm\\:grid-cols-2.md\\:grid-cols-5.gap-3.p-4 a').each(function (i, e) {
      const result = {}
      result.id = $(this).attr('href')
      result.cover = $(this).find('a > img').attr('src')
      result.url = host + result.id
      result.name = utils.cleanStr($(this).find('span.block.text-[13.3px].font-bold').text())
      result.state = utils.cleanStr($(this).find('span.status').text())
      results.push(result)
    })
    return results
  }

  async #parseManga (host, doc, id) {
    const result = {}
    const $ = cheerio.load(doc)

    result.title = $('body > text-xl font-bold  ').text()
    result.score = $('.rating-star > p').text();
    result.altTitle = ''
    result.demographics = ''
    
    result.genres = []

    $('div.flex.flex-row.flex-wrap.gap-3 button').each(function(i, e) {
        result.genres.push($(this).text());
    }) 
    
    result.genres = result.filter(n => n)
    
    
    result.authors = ''
    
    
    result.desc = $('body > div.container > div.flex.flex-col.sm\\:flex-row.my-3 > div.flex.flex-col > div:nth-child(2) > p').text()
    result.cover = $('div.space-y-7 > div.space-y-4 img[alt="poster"]').attr('src')
    result.url = id
    return result
  }

  async #parseSearchChapters (doc, host, id) {
    const results = []
    const $ = cheerio.load(doc)

    $('div.overflow-y-auto.scrollbar-thumb-themecolor.scrollbar-track-transparent > div.cursor-pointer').each(function () {
      const result = {}
      result.uri = host + utils.cleanStr($(this).find('h3.font-medium a').attr('href'))
      result.chapter = utils.cleanStr($(this).find('h3.font-medium a').text())
      result.lang = 'en'
      result.id = result.uri;
      //[result.title, result.chapter] = utils.extractTitleNChapter(result.title)
      results.push(result)
    })
    return results
  }

  async #parseChapterPagesURL (doc, id) {
    const results = []
    const $ = cheerio.load(doc)
    $('img[class*="object-cover mx-auto"]').each(function (i, e) {
      i++
      const result = {}
      result.page = i
      result.chapterId = id
      result.url = $(e).attr('src')
      result.title = $(e).attr('alt')
      results.push(result)
    })

    return results
  }

  // ----------------------------------------------------------------------------------------------------------------
  async #helperLookupMangas (host, query, offset, page) {
    logger.log('Asurascans trying to find manga');
    const url = `${this.host}/series?name=${encodeURIComponent(query)}`
    if (page === 1) {
      try {
        const body = await this.#limiter.schedule(() => utils.getBody(url, null, true, false))
        return await this.#parseSearch(this.host, body)
      } catch (e) {
        logger.error({ err: e }, 'Error in Asurascans helperLookupMangas')
        throw e
      }
    } else {
      return []
    }
  }

  async #getMangaById (host, ids) { 
    try {
      if (ids.url?.includes('/series')) {
        const body = await this.#limiter.schedule(() => utils.getBody(ids.url, null, true, false))
        return await this.#parseManga(this.host, body, ids.url)
      } else {
        const url = `${this.host}/series/${ids.id}`
        const body = await this.#limiter.schedule(() => utils.getBody(url, null, true, false))
        return await this.#parseManga(this.host, body, ids.id)
      }
    } catch (e) {
      logger.error({ err: e })
      throw e
    }
  }

  async #funcHelperLookupChapters (host, ids, offset, page, lang) {
    try {
      if (page === 1) {
        const url = `${this.host}/series/${ids.id}`
        const body = await this.#limiter.schedule(() => utils.getBody(url, null, true, false))
        return await this.#parseSearchChapters(body, this.host, ids.url)
      } else {
        return []
      }
    } catch (e) {
      logger.error({ err: e })
      return null
    }
  }

  async #funcHelperChapterPagesURLByChapterId (host, ids) {
    try {
      const body = await this.#limiter.schedule(() => utils.getBody(ids.id, null, false, false))
      return await this.#parseChapterPagesURL(body, ids.url)
    } catch (e) {
      logger.error({ err: e }, 'Error in Asurascans helperChapterPagesURLByChapterId')
      throw e
    }
  }

  // #endregion

  // #region public
  constructor () {
    super()
    this.id = 'asurascans'
    this.label = 'Asurascans'
    this.url = 'https://asuracomic.net'
    this.credits = 'Asurascans'
    this.tags = []
    this.iconURL = 'https://asuracomic.net/images/logo.webp'
    this.sourceURL = 'https://asuracomic.net/series/[id]'
    this.options = ''
    this.lang = ['en']
    this.caps = [AgentCapabilities.MANGA_METADATA_FETCH, AgentCapabilities.CHAPTER_FETCH]
    this.host = 'https://asuracomic.net'
    this.priority = 40
    this.coverPriority = 45
    // -------------------------------------------------
    this.limiter = this.#limiter
    this.offsetInc = 100
    this.maxPages = 1
    this.mangaSchema = this.#mangaSchema
    this.lookupSchema = this.#lookupSchema
    this.chapterSchema = this.#chapterSchema
    this.pageSchema = this.#pageSchema
    this.funcHelperLookupMangas = this.#helperLookupMangas
    this.funcGetMangaById = this.#getMangaById
    this.funcHelperLookupChapters = this.#funcHelperLookupChapters
    this.funcHelperChapterPagesURLByChapterId = this.#funcHelperChapterPagesURLByChapterId
  };

  // #endregion
}

module.exports = Asurascans
